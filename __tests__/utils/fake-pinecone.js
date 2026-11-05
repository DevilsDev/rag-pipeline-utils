"use strict";

/**
 * An in-memory Pinecone serverless index behind a fetch function, for
 * PineconeRetriever's tests: upsert, query (cosine), delete (ids, deleteAll,
 * a metadata $eq/$exists filter), list and fetch, the dimension check, the
 * API-key check, and eventual consistency. Writes get increasing log
 * sequence numbers (x-pinecone-request-lsn); reads see the index as of
 * `indexed` (x-pinecone-max-indexed-lsn), which catches up one write per
 * read when `lag` is on, so a reader that doesn't wait sees stale data.
 */

function fakePinecone({
  apiKey = "test-key",
  dimension = 4,
  host = "https://idx-abc.svc.test.pinecone.io",
  indexName = "docs",
  lag = true,
} = {}) {
  const log = []; // { lsn, namespace, op, ... }
  let indexed = 0;
  const calls = [];

  const state = (namespace) => {
    const records = new Map();
    for (const entry of log) {
      if (entry.lsn > indexed || entry.namespace !== namespace) continue;
      if (entry.op === "upsert") {
        for (const v of entry.vectors) records.set(v.id, v);
      } else if (entry.op === "deleteAll") records.clear();
      else if (entry.op === "deleteIds") {
        for (const id of entry.ids) records.delete(id);
      } else if (entry.op === "deleteFilter") {
        for (const [id, v] of records) {
          if (matches(v.metadata, entry.filter)) records.delete(id);
        }
      }
    }
    return records;
  };

  const matches = (metadata = {}, filter = {}) =>
    Object.entries(filter).every(([key, cond]) => {
      if ("$eq" in cond) return metadata[key] === cond.$eq;
      if ("$exists" in cond) return key in metadata === cond.$exists;
      throw new Error(`fake: unsupported filter ${JSON.stringify(cond)}`);
    });

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

  const json = (status, body, headers = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });

  const write = (entry) => {
    const lsn = log.length + 1;
    log.push({ lsn, ...entry });
    if (!lag) indexed = lsn;
    return { "x-pinecone-request-lsn": String(lsn) };
  };

  const read = () => {
    if (lag && indexed < log.length) indexed += 1;
    return { "x-pinecone-max-indexed-lsn": String(indexed) };
  };

  async function fetch(url, init = {}) {
    const u = new URL(url);
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, url: u.href, body, headers: init.headers });
    if (init.signal && init.signal.aborted) {
      const e = new Error("This operation was aborted");
      e.name = "AbortError";
      throw e;
    }
    if (init.headers["Api-Key"] !== apiKey) {
      return json(401, {
        error: { code: "UNAUTHENTICATED", message: "Invalid API Key" },
      });
    }
    if (u.origin === "https://api.pinecone.io") {
      if (method === "GET" && u.pathname === `/indexes/${indexName}`) {
        return json(200, {
          name: indexName,
          host: host.replace("https://", ""),
          status: { ready: true },
        });
      }
      return json(404, {
        error: { code: "NOT_FOUND", message: "Index not found" },
      });
    }
    if (u.origin !== host) return json(404, { message: "unknown host" });

    const namespace =
      (body && body.namespace) ?? u.searchParams.get("namespace") ?? "";
    switch (`${method} ${u.pathname}`) {
      case "POST /vectors/upsert": {
        for (const v of body.vectors) {
          if (v.values.length !== dimension) {
            return json(400, {
              code: 3,
              message: `Vector dimension ${v.values.length} does not match the dimension of the index ${dimension}`,
            });
          }
          for (const value of Object.values(v.metadata || {})) {
            if (
              value !== null &&
              typeof value === "object" &&
              !Array.isArray(value)
            ) {
              return json(400, {
                code: 3,
                message:
                  "Metadata value must be a string, number, boolean or list of strings",
              });
            }
          }
        }
        return json(
          200,
          { upsertedCount: body.vectors.length },
          write({ namespace, op: "upsert", vectors: body.vectors }),
        );
      }
      case "POST /query": {
        const headers = read();
        const matched = [...state(namespace).values()]
          .map((v) => ({
            id: v.id,
            score: cosine(v.values, body.vector),
            ...(body.includeMetadata && { metadata: v.metadata }),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, body.topK);
        return json(200, { matches: matched, namespace }, headers);
      }
      case "POST /vectors/delete": {
        if (body.deleteAll) {
          if (!log.some((e) => e.namespace === namespace)) {
            return json(404, { code: 5, message: "Namespace not found" });
          }
          return json(200, {}, write({ namespace, op: "deleteAll" }));
        }
        if (body.ids)
          return json(
            200,
            {},
            write({ namespace, op: "deleteIds", ids: body.ids }),
          );
        return json(
          200,
          {},
          write({ namespace, op: "deleteFilter", filter: body.filter }),
        );
      }
      case "GET /vectors/list": {
        const ids = [...state(namespace).keys()].sort();
        const limit = Number(u.searchParams.get("limit") || 100);
        const start = Number(u.searchParams.get("paginationToken") || 0);
        const page = ids.slice(start, start + limit);
        return json(200, {
          vectors: page.map((id) => ({ id })),
          ...(start + limit < ids.length && {
            pagination: { next: String(start + limit) },
          }),
          namespace,
        });
      }
      case "GET /vectors/fetch": {
        const records = state(namespace);
        const vectors = {};
        for (const id of u.searchParams.getAll("ids")) {
          if (records.has(id)) vectors[id] = records.get(id);
        }
        return json(200, { vectors, namespace });
      }
      default:
        return json(404, { message: `fake: no route ${method} ${u.pathname}` });
    }
  }

  return { fetch, calls, host, indexName, apiKey, log };
}

module.exports = { fakePinecone };
