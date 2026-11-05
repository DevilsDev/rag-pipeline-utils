"use strict";

/**
 * An in-memory Weaviate 1.39 behind a fetch function, for
 * WeaviateRetriever's tests: the schema endpoints, batch import (200 with
 * per-object errors, including Weaviate's vector-length error), batch
 * delete with Weaviate's per-call limit (QUERY_MAXIMUM_RESULTS), the
 * object cursor (`after`, ordered by UUID, no filter), and the two
 * GraphQL queries the retriever sends (Get with nearVector, Aggregate
 * count). Anything else fails loudly, so a request the real server would
 * see differently shows up here first. __tests__/integration runs the same
 * contract against a real Weaviate in CI.
 */

function fakeWeaviate({
  url = "http://weaviate.test:8080",
  apiKey,
  maxResults = 10000,
} = {}) {
  const classes = new Map(); // name -> { schema, objects: Map(uuid -> obj) }
  const calls = [];

  const reply = (status, json) => ({
    status,
    ok: status >= 200 && status < 300,
    statusText: "",
    text: async () => (json === undefined ? "" : JSON.stringify(json)),
  });
  const fail = (status, message) => reply(status, { error: [{ message }] });

  const matches = (properties, where) => {
    const value = properties[where.path[0]];
    switch (where.operator) {
      case "Like":
        if (where.valueText !== "*") {
          throw new Error(`fake: unsupported Like ${where.valueText}`);
        }
        return typeof value === "string";
      case "Equal":
        return value === where.valueText;
      case "ContainsAny":
        return where.valueTextArray.includes(value);
      default:
        throw new Error(`fake: unsupported operator ${where.operator}`);
    }
  };

  const cosine = (a, b) => {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    return dot / Math.sqrt(na * nb);
  };

  const OURS = '{ path: ["rag_id"], operator: Like, valueText: "*" }';
  const GET =
    /^\{ Get \{ (\w+)\(nearVector: \{ vector: (\[[-0-9.e,]*\]) \}, limit: (\d+), where: ([^)]*)\) \{ rag_id content rag_metadata _additional \{ distance \} \} \} \}$/;
  const AGGREGATE =
    /^\{ Aggregate \{ (\w+)\(where: ([^)]*)\) \{ meta \{ count \} \} \} \}$/;

  function graphql(query) {
    let m = GET.exec(query);
    if (m) {
      const [, name, vector, limit, where] = m;
      const c = classes.get(name);
      if (!c) {
        return reply(200, {
          errors: [
            {
              message: `Cannot query field "${name}" on type "GetObjectsObj".`,
            },
          ],
        });
      }
      if (where !== OURS) throw new Error(`fake: unexpected filter ${where}`);
      const q = JSON.parse(vector);
      const hits = [...c.objects.values()]
        .filter((o) => typeof o.properties.rag_id === "string")
        .map((o) => {
          if (o.vector.length !== q.length) {
            throw new Error("fake: query vector of the wrong length");
          }
          return { o, distance: 1 - cosine(o.vector, q) };
        })
        .sort((a, b) => a.distance - b.distance)
        .slice(0, Number(limit))
        .map(({ o, distance }) => ({
          rag_id: o.properties.rag_id,
          content: o.properties.content,
          rag_metadata: o.properties.rag_metadata,
          _additional: { distance },
        }));
      return reply(200, { data: { Get: { [name]: hits } } });
    }
    m = AGGREGATE.exec(query);
    if (m) {
      const [, name, where] = m;
      const c = classes.get(name);
      if (!c) {
        return reply(200, { errors: [{ message: `no class ${name}` }] });
      }
      if (where !== OURS) throw new Error(`fake: unexpected filter ${where}`);
      const count = [...c.objects.values()].filter(
        (o) => typeof o.properties.rag_id === "string",
      ).length;
      return reply(200, {
        data: { Aggregate: { [name]: [{ meta: { count } }] } },
      });
    }
    throw new Error(`fake: unsupported GraphQL ${query}`);
  }

  function batchImport(objects) {
    return objects.map((o) => {
      const c = classes.get(o.class);
      const failed = (message) => ({
        ...o,
        result: { status: "FAILED", errors: { error: [{ message }] } },
      });
      if (!c) return failed(`class ${o.class} not found`);
      const existing = [...c.objects.values()].find(
        (x) => x.id !== o.id && x.vector,
      );
      if (existing && existing.vector.length !== o.vector.length) {
        return failed(
          `insert to vector index: new node has a vector with length ${o.vector.length}. Existing nodes have vectors with length ${existing.vector.length}`,
        );
      }
      c.objects.set(o.id, {
        id: o.id,
        vector: o.vector,
        properties: { ...o.properties },
      });
      return { ...o, result: { status: "SUCCESS" } };
    });
  }

  function batchDelete({ match, output }) {
    if (output !== "minimal") throw new Error("fake: expected minimal output");
    const c = classes.get(match.class);
    if (!c) return fail(422, `class ${match.class} not found`);
    const found = [...c.objects.values()].filter((o) =>
      matches(o.properties, match.where),
    );
    const handled = found.slice(0, maxResults);
    for (const o of handled) c.objects.delete(o.id);
    return reply(200, {
      results: {
        matches: Math.min(found.length, maxResults + 1),
        limit: maxResults,
        successful: handled.length,
        failed: 0,
      },
    });
  }

  const fetch = jest.fn(async (requestUrl, init = {}) => {
    const u = new URL(requestUrl);
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: requestUrl, method, headers: init.headers, body });
    if (init.signal && init.signal.aborted) {
      const err = new Error("This operation was aborted");
      err.name = "AbortError";
      throw err;
    }
    if (`${u.protocol}//${u.host}` !== url) {
      throw new Error(`fake: request to another host ${u.host}`);
    }
    if (apiKey && init.headers.authorization !== `Bearer ${apiKey}`) {
      return reply(401, { code: 401, message: "anonymous access not enabled" });
    }
    const parts = u.pathname.split("/").filter(Boolean); // v1, ...
    if (parts[0] !== "v1") throw new Error(`fake: no /v1 in ${u.pathname}`);
    const route = `${method} /${parts.slice(1).join("/")}`;

    if (route === "POST /graphql") return graphql(body.query);
    if (route === "POST /batch/objects") {
      return reply(200, batchImport(body.objects));
    }
    if (route === "DELETE /batch/objects") return batchDelete(body);
    if (route === "POST /schema") {
      if (classes.has(body.class)) {
        return fail(422, `class name ${body.class} already exists`);
      }
      classes.set(body.class, { schema: body, objects: new Map() });
      return reply(200, body);
    }
    if (parts[1] === "schema" && parts.length === 3 && method === "GET") {
      const c = classes.get(parts[2]);
      return c ? reply(200, c.schema) : reply(404);
    }
    if (parts[1] === "schema" && parts[3] === "properties") {
      const c = classes.get(parts[2]);
      if (!c) return fail(422, "class not found");
      c.schema.properties = [...(c.schema.properties || []), body];
      return reply(200, body);
    }
    if (route === "GET /objects") {
      const c = classes.get(u.searchParams.get("class"));
      if (!c) return reply(200, { objects: [], totalResults: 0 });
      const after = u.searchParams.get("after") || "";
      const limit = Number(u.searchParams.get("limit") || 25);
      const withVector = u.searchParams.get("include") === "vector";
      const objects = [...c.objects.values()]
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .filter((o) => o.id > after)
        .slice(0, limit)
        .map((o) => ({
          class: u.searchParams.get("class"),
          id: o.id,
          properties: o.properties,
          ...(withVector && { vector: o.vector }),
        }));
      return reply(200, { objects, totalResults: objects.length });
    }
    throw new Error(`fake: unsupported ${route}`);
  });

  /** Adds an object another client wrote (no rag_id). */
  function addForeign(className, id, vector, properties = {}) {
    classes.get(className).objects.set(id, { id, vector, properties });
  }

  return { url, apiKey, fetch, calls, classes, addForeign };
}

module.exports = { fakeWeaviate };
