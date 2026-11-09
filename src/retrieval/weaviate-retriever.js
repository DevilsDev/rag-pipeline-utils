'use strict';

/**
 * Retriever on Weaviate, through its REST and GraphQL APIs with the built-in
 * fetch: no client package is needed. Written against Weaviate 1.39 and
 * 1.40 (the endpoints it uses are the same in both). It uses the
 * collection's legacy (unnamed) vector, which 1.40 creates only when the
 * collection asks for it, as the one this class creates does.
 *
 * Vectors are self-provided (`vectorizer: "none"`, cosine distance). Object
 * ids must be UUIDs, so each document id is mapped to the same UUID
 * QdrantRetriever derives from it, and the original id is kept in the
 * `rag_id` property. Weaviate's properties need a schema, so metadata is
 * stored as a JSON string (`rag_metadata`, with top-level `acl` and
 * `requiredRole` under `rag_access`), and `metadata.source` is copied
 * to its own exact-match property (`rag_source`) for removeBySource.
 *
 * Weaviate returns 200 for a batch with failed objects and for a GraphQL
 * query with errors, so both are checked here. Nothing user-supplied goes
 * into GraphQL: queries carry only the validated class name, the
 * (finite-number) query vector and a constant filter; deletes by id or
 * source go through the REST batch API as JSON.
 *
 * The collection can change without this process knowing, so the
 * retriever has no cache identity unless you give it a `cacheKey`.
 */

const { throwIfAborted } = require('../connectors/connector-utils');
const { pointId } = require('./qdrant-retriever');
const { storedMetadata, readStoredMetadata } = require('./access-fields');

// Weaviate class names: a letter, then letters, digits and "_"; Weaviate
// upper-cases the first letter, so it is upper-cased here too.
const COLLECTION = /^[A-Za-z][A-Za-z0-9_]{0,254}$/;
const DEFAULT_COLLECTION = 'RagDocuments';
const PAGE = 256;
const UPSERT_BATCH = 256;
const DELETE_BATCH = 256;

// `field` tokenization keeps ids and sources whole, so Equal and
// ContainsAny match exactly ("docs/a.md" is not split into words).
const PROPERTIES = [
  {
    name: 'rag_id',
    dataType: ['text'],
    tokenization: 'field',
    indexFilterable: true,
    indexSearchable: false,
  },
  { name: 'content', dataType: ['text'], indexFilterable: false },
  {
    name: 'rag_source',
    dataType: ['text'],
    tokenization: 'field',
    indexFilterable: true,
    indexSearchable: false,
  },
  {
    name: 'rag_metadata',
    dataType: ['text'],
    indexFilterable: false,
    indexSearchable: false,
  },
];

// Matches every object this class wrote, and nothing else in the
// collection. Like "*" instead of IsNull, which needs indexNullState on
// the collection.
const OURS = { path: ['rag_id'], operator: 'Like', valueText: '*' };
const OURS_GRAPHQL = '{ path: ["rag_id"], operator: Like, valueText: "*" }';

function checkVector(vector, id) {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error(`WeaviateRetriever: document "${id}" has no vector`);
  }
  if (!vector.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    throw new Error(
      `WeaviateRetriever: document "${id}" has a vector with a non-finite value`,
    );
  }
}

function trimSlashes(url) {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') end--;
  return url.slice(0, end);
}

/** A document's metadata and top-level access fields from `rag_metadata`. */
function parseMetadata(text) {
  let value = {};
  try {
    value = text ? JSON.parse(text) : {};
  } catch {
    value = {};
  }
  const { metadata, access } = readStoredMetadata(
    value && typeof value === 'object' ? value : {},
  );
  return { metadata, ...access };
}

/** Weaviate's error messages from a response body, joined. */
function errorDetail(json) {
  const list = (json && (json.error || json.errors)) || [];
  if (Array.isArray(list) && list.length) {
    return list.map((e) => (e && e.message) || String(e)).join('; ');
  }
  return (json && json.message) || '';
}

/**
 * Retriever on Weaviate over its REST and GraphQL APIs, with no client
 * package. Creates the collection on first store; similarity is cosine.
 */
class WeaviateRetriever {
  /**
   * @param {Object} [options]
   * @param {string} [options.url='http://localhost:8080'] - Weaviate's REST endpoint (without /v1)
   * @param {string} [options.apiKey] - Sent as `Authorization: Bearer <key>`
   * @param {string} [options.collection='RagDocuments'] - Class name; the first letter is upper-cased, as Weaviate does
   * @param {number} [options.dimensions] - Expected vector size; defaults to the collection's or the first stored vector's
   * @param {boolean} [options.createCollection=true] - Create the collection (and any missing properties) on first store
   * @param {string} [options.cacheKey] - Cache identity; change it when the collection changes
   * @param {Function} [options.fetch] - fetch implementation (defaults to the global)
   */
  constructor(options = {}) {
    const {
      url = 'http://localhost:8080',
      apiKey,
      collection = DEFAULT_COLLECTION,
      dimensions,
      createCollection = true,
      cacheKey,
      fetch: fetchImpl = globalThis.fetch,
    } = options;
    if (typeof collection !== 'string' || !COLLECTION.test(collection)) {
      throw new Error(
        `WeaviateRetriever: invalid collection name "${collection}" (a letter, then letters, digits and "_")`,
      );
    }
    if (
      dimensions !== undefined &&
      !(Number.isInteger(dimensions) && dimensions > 0)
    ) {
      throw new Error(
        'WeaviateRetriever: `dimensions` must be a positive integer',
      );
    }
    if (typeof fetchImpl !== 'function') {
      throw new Error('WeaviateRetriever needs fetch (Node.js 18 or later)');
    }
    this.url = trimSlashes(String(url));
    this.collection = collection[0].toUpperCase() + collection.slice(1);
    this.dimensions = dimensions;
    this.createCollection = createCollection;
    this.cacheKey = cacheKey;
    this._apiKey = apiKey;
    // Bound: Cloudflare Workers reject fetch called as another object's
    // method ("Illegal invocation").
    this._fetch =
      fetchImpl === globalThis.fetch ? fetchImpl.bind(globalThis) : fetchImpl;
    this._ready = null;
    this._exists = false;
  }

  /**
   * Cache identity for createRagPipeline({ cache }): none unless you set
   * `cacheKey`, since other clients can change the collection.
   * @param {'retriever'} role
   * @returns {string|null}
   */
  getCacheKey(role) {
    if (role !== 'retriever' || !this.cacheKey) return null;
    return `weaviate|${this.url}|${this.collection}|${this.cacheKey}`;
  }

  /** The message without the API key, should a server ever echo it. */
  _redact(message) {
    const text = String(message);
    return this._apiKey ? text.split(this._apiKey).join('***') : text;
  }

  /**
   * One REST call; resolves the parsed body.
   * @private
   * @param {string} method
   * @param {string} path - After /v1
   * @param {Object} [body]
   * @param {{ signal?: AbortSignal, allow404?: boolean }} [options] - allow404 resolves null on 404
   * @returns {Promise<any>}
   */
  async _request(method, path, body, { signal, allow404 = false } = {}) {
    throwIfAborted(signal);
    const headers = { 'content-type': 'application/json' };
    if (this._apiKey) headers.authorization = `Bearer ${this._apiKey}`;
    let res;
    try {
      res = await this._fetch(`${this.url}/v1${path}`, {
        method,
        headers,
        ...(body !== undefined && { body: JSON.stringify(body) }),
        ...(signal && { signal }),
      });
    } catch (err) {
      throwIfAborted(signal);
      throw new Error(
        this._redact(
          `WeaviateRetriever: cannot reach Weaviate at ${this.url} (${err.message})`,
        ),
      );
    }
    if (res.status === 404 && allow404) return null;
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `WeaviateRetriever: Weaviate refused the request (${res.status}); check WEAVIATE_API_KEY`,
        );
      }
      const detail = errorDetail(json) || text || res.statusText;
      const where = path.split('?')[0];
      throw new Error(
        this._redact(
          `WeaviateRetriever: ${method} ${where} failed (${res.status}): ${detail}`,
        ),
      );
    }
    return json;
  }

  /** A GraphQL query; resolves `data`, throws on GraphQL errors. */
  async _graphql(query, signal) {
    const json = await this._request('POST', '/graphql', { query }, { signal });
    if (json.errors && json.errors.length) {
      throw new Error(
        this._redact(
          `WeaviateRetriever: GraphQL query failed: ${errorDetail(json)}`,
        ),
      );
    }
    return json.data || {};
  }

  /** The collection's schema, or null when it doesn't exist. */
  _schema(signal) {
    return this._request('GET', `/schema/${this.collection}`, undefined, {
      signal,
      allow404: true,
    });
  }

  /** Whether the collection exists; only a yes is remembered. */
  async _collectionExists(signal) {
    if (!this._exists) this._exists = Boolean(await this._schema(signal));
    return this._exists;
  }

  _ensureCollection() {
    if (!this._ready) {
      this._ready = (async () => {
        if (this.createCollection) {
          const schema = await this._schema();
          if (!schema) {
            try {
              await this._request('POST', '/schema', {
                class: this.collection,
                vectorizer: 'none',
                vectorIndexType: 'hnsw',
                vectorIndexConfig: { distance: 'cosine' },
                properties: PROPERTIES,
              });
            } catch (err) {
              // Another writer created it first.
              if (!/already exists/i.test(err.message)) throw err;
            }
          } else {
            // A collection made elsewhere: add the properties it lacks, so
            // auto-schema doesn't give rag_id and rag_source word
            // tokenization (which breaks exact matches).
            const have = new Set((schema.properties || []).map((p) => p.name));
            for (const property of PROPERTIES) {
              if (!have.has(property.name)) {
                await this._request(
                  'POST',
                  `/schema/${this.collection}/properties`,
                  property,
                );
              }
            }
          }
          this._exists = true;
        }
        // Weaviate keeps no vector size in the schema; read it from a
        // stored object so a wrong-size batch fails with a clear message.
        if (!this.dimensions) {
          const page = await this._request(
            'GET',
            `/objects?class=${this.collection}&limit=1&include=vector`,
            undefined,
            { allow404: true },
          );
          const vector =
            page && page.objects && page.objects[0] && page.objects[0].vector;
          if (Array.isArray(vector) && vector.length) {
            this.dimensions = vector.length;
          }
        }
      })().catch((err) => {
        this._ready = null;
        throw err;
      });
    }
    return this._ready;
  }

  /**
   * Inserts or replaces documents.
   * @param {Array<{ id: string, vector: number[], content?: string, metadata?: Object }>} docs
   * @returns {Promise<void>}
   */
  async store(docs) {
    if (!Array.isArray(docs))
      throw new Error('WeaviateRetriever.store() takes an array');
    if (docs.length === 0) return;
    let dimensions = null;
    const objects = docs.map((doc) => {
      const id = doc && doc.id;
      if (typeof id !== 'string' || id.length === 0) {
        throw new Error(
          'WeaviateRetriever.store(): every document needs a string id',
        );
      }
      checkVector(doc.vector, id);
      if (dimensions === null) dimensions = doc.vector.length;
      else if (doc.vector.length !== dimensions) {
        throw new Error(
          `WeaviateRetriever.store(): document "${id}" has ${doc.vector.length} dimensions, the batch has ${dimensions}`,
        );
      }
      const metadata = doc.metadata || {};
      const properties = {
        rag_id: id,
        content: doc.content || '',
        rag_metadata: JSON.stringify(storedMetadata(doc)),
      };
      if (metadata.source !== undefined && metadata.source !== null) {
        properties.rag_source = String(metadata.source);
      }
      return {
        class: this.collection,
        id: pointId(id),
        vector: doc.vector,
        properties,
      };
    });
    await this._ensureCollection();
    if (this.dimensions && dimensions !== this.dimensions) {
      throw new Error(
        `WeaviateRetriever.store(): the documents have ${dimensions} dimensions, the collection has ${this.dimensions}`,
      );
    }
    for (let i = 0; i < objects.length; i += UPSERT_BATCH) {
      const batch = objects.slice(i, i + UPSERT_BATCH);
      const results = await this._request('POST', '/batch/objects', {
        objects: batch,
      });
      // The batch answers 200 with per-object errors.
      for (const [j, item] of (Array.isArray(results)
        ? results
        : []
      ).entries()) {
        const detail = item && item.result && errorDetail(item.result.errors);
        if (!detail) continue;
        const id = batch[j] ? batch[j].properties.rag_id : '?';
        // "new node has a vector with length 3. Existing nodes have
        // vectors with length 4"
        const kind = /vectors? with length/i.test(detail)
          ? 'has the wrong vector dimensions'
          : 'was not stored';
        throw new Error(
          this._redact(
            `WeaviateRetriever.store(): document "${id}" ${kind}: ${detail}`,
          ),
        );
      }
    }
    this._exists = true;
    if (!this.dimensions) this.dimensions = dimensions;
  }

  /**
   * The documents most similar to a query vector.
   * @param {number[]|{ queryVector?: number[], topK?: number, signal?: AbortSignal }} request
   *   A vector, or an object with one (required; optional in the type to
   *   match the retriever contract)
   * @param {number} [k=10] - Results when `request` is a vector
   * @returns {Promise<Array<{ id: string, score: number, content: string, metadata: Object }>>}
   */
  async retrieve(request, k = 10) {
    const {
      queryVector,
      topK = k,
      signal,
    } = Array.isArray(request) ? { queryVector: request } : request || {};
    if (!Number.isInteger(topK) || topK < 1) {
      throw new Error(
        'WeaviateRetriever.retrieve(): topK must be a positive integer',
      );
    }
    checkVector(queryVector, 'query');
    throwIfAborted(signal);
    if (!(await this._collectionExists(signal))) return [];
    const data = await this._graphql(
      `{ Get { ${this.collection}(nearVector: { vector: ${JSON.stringify(queryVector)} }, limit: ${topK}, where: ${OURS_GRAPHQL}) { rag_id content rag_metadata _additional { distance } } } }`,
      signal,
    );
    throwIfAborted(signal);
    const hits = (data.Get && data.Get[this.collection]) || [];
    // Cosine distance is 1 - cosine similarity.
    return hits.map((hit) => ({
      id: hit.rag_id,
      score: 1 - hit._additional.distance,
      content: hit.content || '',
      ...parseMetadata(hit.rag_metadata),
    }));
  }

  /**
   * Deletes the matching objects, a server-limited round at a time.
   * @private
   */
  async _deleteWhere(where) {
    if (!(await this._collectionExists())) return;
    for (;;) {
      const json = await this._request('DELETE', '/batch/objects', {
        match: { class: this.collection, where },
        output: 'minimal',
      });
      const r = (json && json.results) || {};
      if (r.failed > 0) {
        throw new Error(
          `WeaviateRetriever: ${r.failed} objects could not be deleted`,
        );
      }
      // `matches` stops one above `limit` when more remain.
      if (!(r.limit > 0 && r.matches > r.limit && r.successful > 0)) return;
    }
  }

  /**
   * Deletes the chunks of one source (`metadata.source`), for re-ingesting.
   * @param {string} source
   */
  async removeBySource(source) {
    await this._deleteWhere({
      path: ['rag_source'],
      operator: 'Equal',
      valueText: String(source),
    });
  }

  /**
   * Deletes documents by id.
   * @param {string[]} ids
   */
  async delete(ids) {
    for (let i = 0; i < ids.length; i += DELETE_BATCH) {
      await this._deleteWhere({
        path: ['rag_id'],
        operator: 'ContainsAny',
        valueTextArray: ids.slice(i, i + DELETE_BATCH).map(String),
      });
    }
  }

  /** Deletes every document this class stored; the collection stays. */
  async clear() {
    await this._deleteWhere(OURS);
  }

  /** @returns {Promise<number>} */
  async size() {
    if (!(await this._collectionExists())) return 0;
    const data = await this._graphql(
      `{ Aggregate { ${this.collection}(where: ${OURS_GRAPHQL}) { meta { count } } } }`,
    );
    const rows = (data.Aggregate && data.Aggregate[this.collection]) || [];
    return rows[0] && rows[0].meta ? rows[0].meta.count : 0;
  }

  /**
   * Every document, without vectors.
   * @param {{ limit?: number }} [options]
   * @returns {Promise<Array<{ id: string, content: string, metadata: Object }>>}
   */
  async list({ limit } = {}) {
    const out = [];
    if (!(await this._collectionExists())) return out;
    // The cursor (`after`) can't take a filter, so objects other writers
    // stored are skipped here.
    let after = '';
    for (;;) {
      const page = await this._request(
        'GET',
        `/objects?class=${this.collection}&limit=${PAGE}&after=${encodeURIComponent(after)}`,
        undefined,
        { allow404: true },
      );
      const objects = (page && page.objects) || [];
      for (const o of objects) {
        const p = o.properties || {};
        if (typeof p.rag_id !== 'string') continue;
        out.push({
          id: p.rag_id,
          content: p.content || '',
          ...parseMetadata(p.rag_metadata),
        });
        if (limit && out.length >= limit) return out;
      }
      if (objects.length < PAGE) return out;
      after = objects[objects.length - 1].id;
    }
  }
}

module.exports = { WeaviateRetriever };
