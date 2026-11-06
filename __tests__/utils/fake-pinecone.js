"use strict";

/**
 * An in-memory Pinecone serverless index behind a fetch function, for
 * PineconeRetriever's tests, as API version 2026-07 serves it:
 *
 * - kind "documents": a document index with a dense_vector field
 *   (`embedding`), through the Documents API;
 * - kind "vectors": a vector index, through the vectors API;
 * - kind "integrated": a document index that embeds text itself (field
 *   `chunk_text`, as the console's quick start creates), with a
 *   deterministic bag-of-words "model": each word hashed into one of 64
 *   dimensions, so texts sharing words score high. Up to 96 documents per
 *   upsert, as on Pinecone; searches score by `{ type: "embed" }`.
 *
 * Plus the control plane (describe one index, list indexes), the dimension
 * and API-key checks, and eventual consistency: writes get increasing log
 * sequence numbers (x-pinecone-request-lsn; a document index's delete_all
 * gets none, as on Pinecone), and searches see the index as of `indexed`
 * (x-pinecone-max-indexed-lsn), which catches up one write per search when
 * `lag` is on, so a reader that doesn't wait sees stale data.
 */

function fakePinecone({
  apiKey = "test-key",
  dimension = 4,
  host = "https://idx-abc.svc.test.pinecone.io",
  indexName = "docs",
  kind = "documents",
  lag = true,
} = {}) {
  const log = []; // { lsn, namespace, op, ... }
  let indexed = 0;
  const calls = [];
  const integrated = kind === "integrated";
  const FIELD = integrated ? "chunk_text" : "embedding";
  const EMBED_DIMENSION = 64;
  const MAX_EMBED_BATCH = 96;
  let embedded = 0; // texts "embedded", documents and queries

  // The integrated index's "model": bag of words, normalized
  const embed = (text) => {
    embedded += 1;
    const v = new Array(EMBED_DIMENSION).fill(0);
    for (const word of String(text)
      .toLowerCase()
      .split(/[^a-z0-9]+/)) {
      if (!word) continue;
      let h = 0;
      for (const ch of word) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      v[h % EMBED_DIMENSION] += 1;
    }
    return v;
  };

  const matches = (metadata = {}, filter = {}) =>
    Object.entries(filter).every(([key, cond]) => {
      if ("$eq" in cond) return metadata[key] === cond.$eq;
      if ("$exists" in cond) return key in metadata === cond.$exists;
      throw new Error(`fake: unsupported filter ${JSON.stringify(cond)}`);
    });

  // Records: { id, values, metadata }
  const state = (namespace, upTo = indexed) => {
    const records = new Map();
    for (const entry of log) {
      if (entry.lsn > upTo || entry.namespace !== namespace) continue;
      if (entry.op === "upsert") {
        for (const r of entry.records) records.set(r.id, r);
      } else if (entry.op === "deleteAll") records.clear();
      else if (entry.op === "deleteIds") {
        for (const id of entry.ids) records.delete(id);
      } else if (entry.op === "deleteFilter") {
        for (const [id, r] of records) {
          if (matches(r.metadata, entry.filter)) records.delete(id);
        }
      }
    }
    return records;
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
    return na * nb === 0 ? 0 : dot / Math.sqrt(na * nb);
  };

  const json = (status, body, headers = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  const error = (status, message) =>
    json(status, { error: { code: "INVALID_ARGUMENT", message }, status });

  const write = (entry, { lsn: withLsn = true } = {}) => {
    const lsn = log.length + 1;
    log.push({ lsn, ...entry });
    if (!lag) indexed = lsn;
    return withLsn ? { "x-pinecone-request-lsn": String(lsn) } : {};
  };
  const read = () => {
    if (lag && indexed < log.length) indexed += 1;
    return { "x-pinecone-max-indexed-lsn": String(indexed) };
  };
  const hasNamespace = (namespace) =>
    log.some((e) => e.namespace === namespace);

  const description = () => {
    const base = {
      name: indexName,
      host: host.replace("https://", ""),
      status: { ready: true, state: "Ready" },
      deletion_protection: "disabled",
    };
    if (kind === "vectors") {
      // As 2026-07 describes a vector index: an implicit schema
      return {
        ...base,
        schema: {
          fields: {
            _sparse_values: { type: "sparse_vector" },
            _values: { type: "dense_vector", dimension, metric: "cosine" },
          },
        },
      };
    }
    if (integrated) {
      // As 2026-07 describes the console's quick-start index (abridged)
      return {
        ...base,
        schema: {
          fields: {
            title: {
              type: "string",
              full_text_search: { language: "en" },
              store_text: true,
            },
            chunk_text: {
              type: "string",
              full_text_search: { language: "en" },
              embed: {
                model: "llama-text-embed-v2",
                dimension: 1024,
                metric: "cosine",
              },
              store_text: true,
            },
          },
        },
      };
    }
    return {
      ...base,
      schema: {
        fields: {
          [FIELD]: { type: "dense_vector", dimension, metric: "cosine" },
        },
      },
    };
  };

  const checkDimension = (values) =>
    values.length !== dimension
      ? error(
          400,
          `Vector dimension ${values.length} does not match the dimension of the index ${dimension}`,
        )
      : null;

  function vectorsApi(method, u, body) {
    const namespace =
      (body && body.namespace) ?? u.searchParams.get("namespace") ?? "";
    switch (`${method} ${u.pathname}`) {
      case "POST /vectors/upsert": {
        for (const v of body.vectors) {
          const bad = checkDimension(v.values);
          if (bad) return bad;
          for (const value of Object.values(v.metadata || {})) {
            if (
              value !== null &&
              typeof value === "object" &&
              !Array.isArray(value)
            ) {
              return error(
                400,
                "Metadata value must be a string, number, boolean or list of strings",
              );
            }
          }
        }
        return json(
          200,
          { upsertedCount: body.vectors.length },
          write({
            namespace,
            op: "upsert",
            records: body.vectors.map((v) => ({
              id: v.id,
              values: v.values,
              metadata: v.metadata || {},
            })),
          }),
        );
      }
      case "POST /query": {
        const headers = read();
        const found = [...state(namespace).values()]
          .filter((r) => !body.filter || matches(r.metadata, body.filter))
          .map((r) => ({
            id: r.id,
            score: cosine(r.values, body.vector),
            ...(body.includeMetadata && { metadata: r.metadata }),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, body.topK);
        return json(200, { matches: found, namespace }, headers);
      }
      case "POST /vectors/delete": {
        if (body.deleteAll) {
          if (!hasNamespace(namespace))
            return error(404, "Namespace not found");
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
        return json(200, {
          vectors: ids.slice(start, start + limit).map((id) => ({ id })),
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
        if (u.pathname.startsWith("/namespaces/")) {
          return error(
            400,
            "This index has no document schema; use the vectors API",
          );
        }
        return json(404, { message: `fake: no route ${method} ${u.pathname}` });
    }
  }

  function documentsApi(method, u, body) {
    const m =
      /^\/namespaces\/([^/]+)\/documents\/(upsert|search|delete|fetch)$/.exec(
        u.pathname,
      );
    if (!m || method !== "POST") {
      if (u.pathname.startsWith("/vectors/") || u.pathname === "/query") {
        return error(
          400,
          "This index has a document schema, so writes must go through the documents API.",
        );
      }
      return json(404, { message: `fake: no route ${method} ${u.pathname}` });
    }
    const namespace = decodeURIComponent(m[1]);
    const pick = (r) => {
      // An integrated index returns the text it stored, not the vector
      const fields = integrated
        ? { _id: r.id, ...r.metadata }
        : { _id: r.id, [FIELD]: r.values, ...r.metadata };
      const wanted = body.include_fields;
      if (!wanted || wanted.includes("*")) return fields;
      return Object.fromEntries(
        Object.entries(fields).filter(
          ([k]) => k === "_id" || wanted.includes(k),
        ),
      );
    };
    switch (m[2]) {
      case "upsert": {
        const records = [];
        if (integrated) {
          if (body.documents.length > MAX_EMBED_BATCH) {
            return error(
              400,
              `At most ${MAX_EMBED_BATCH} documents per request when the schema embeds`,
            );
          }
          for (const doc of body.documents) {
            const { _id, ...metadata } = doc;
            if (typeof doc[FIELD] !== "string" || !doc[FIELD]) {
              return error(400, `document ${_id} has no ${FIELD}`);
            }
            if (doc.embedding || doc.values) {
              return error(400, `document ${_id} has an unknown vector field`);
            }
            records.push({ id: _id, values: embed(doc[FIELD]), metadata });
          }
          return json(
            202,
            { upserted_count: records.length },
            write({ namespace, op: "upsert", records }),
          );
        }
        for (const doc of body.documents) {
          const { _id, [FIELD]: values, ...metadata } = doc;
          if (!values) return error(400, `document ${_id} has no ${FIELD}`);
          const bad = checkDimension(values);
          if (bad) return bad;
          records.push({ id: _id, values, metadata });
        }
        return json(
          202,
          { upserted_count: records.length },
          write({ namespace, op: "upsert", records }),
        );
      }
      case "search": {
        if (!hasNamespace(namespace)) return error(404, "Namespace not found");
        const headers = read();
        const [clause] = body.score_by;
        const type = integrated ? "embed" : "dense_vector";
        if (clause.type !== type || clause.fields[0] !== FIELD) {
          return error(
            400,
            `unknown ${clause.type} field ${clause.fields && clause.fields[0]}`,
          );
        }
        if (integrated && (typeof clause.query !== "string" || !clause.query)) {
          return error(400, "embed needs a query");
        }
        const vector = integrated ? embed(clause.query) : clause.values;
        const found = [...state(namespace).values()]
          .filter((r) => !body.filter || matches(r.metadata, body.filter))
          .map((r) => ({ ...pick(r), _score: cosine(r.values, vector) }))
          .sort((a, b) => b._score - a._score)
          .slice(0, body.top_k);
        return json(200, { matches: found, namespace }, headers);
      }
      case "delete": {
        if (body.delete_all)
          return json(
            202,
            {},
            write({ namespace, op: "deleteAll" }, { lsn: false }),
          );
        if (body.ids)
          return json(
            202,
            {},
            write({ namespace, op: "deleteIds", ids: body.ids }),
          );
        return json(
          202,
          { matched_records: 0 },
          write({ namespace, op: "deleteFilter", filter: body.filter }),
        );
      }
      case "fetch": {
        const records = state(namespace);
        if (body.ids) {
          const documents = {};
          for (const id of body.ids)
            if (records.has(id)) documents[id] = pick(records.get(id));
          return json(200, { documents, namespace });
        }
        const all = [...records.values()]
          .filter((r) => matches(r.metadata, body.filter))
          .sort((a, b) => (a.id < b.id ? -1 : 1));
        const start = Number(body.pagination_token || 0);
        const limit = body.limit || 100;
        const page = all.slice(start, start + limit);
        return json(200, {
          documents: Object.fromEntries(page.map((r) => [r.id, pick(r)])),
          ...(start + limit < all.length && {
            pagination: { next: String(start + limit) },
          }),
          namespace,
        });
      }
      default:
        return json(404, {});
    }
  }

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
      if (method === "GET" && u.pathname === `/indexes/${indexName}`)
        return json(200, description());
      if (method === "GET" && u.pathname === "/indexes") {
        return json(200, {
          indexes: [
            description(),
            { name: "other", host: "other.svc.test.pinecone.io", dimension: 8 },
          ],
        });
      }
      return json(404, {
        error: { code: "NOT_FOUND", message: "Index not found" },
      });
    }
    if (u.origin !== host) return json(404, { message: "unknown host" });
    return kind === "vectors"
      ? vectorsApi(method, u, body)
      : documentsApi(method, u, body);
  }

  return {
    fetch,
    calls,
    host,
    indexName,
    apiKey,
    log,
    field: FIELD,
    embedded: () => embedded,
  };
}

module.exports = { fakePinecone };
