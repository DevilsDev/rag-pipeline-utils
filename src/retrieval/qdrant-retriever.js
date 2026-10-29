'use strict';

/**
 * Retriever on Qdrant, through its REST API with the built-in fetch: no
 * client package is needed.
 *
 * Qdrant point ids must be integers or UUIDs, so each document id is
 * mapped to a UUID derived from it, and the original id is kept in the
 * payload (`rag_id`) with `content` and `metadata`. Writes wait for Qdrant
 * to apply them (`wait=true`), so a query right after ingest sees them.
 * Written against the Qdrant 1.20 API (`/points/query`).
 *
 * The collection can change without this process knowing, so the
 * retriever has no cache identity unless you give it a `cacheKey`.
 */

const crypto = require('crypto');
const { throwIfAborted } = require('../connectors/connector-utils');

const COLLECTION = /^[A-Za-z0-9_-]{1,255}$/;
const DEFAULT_COLLECTION = 'rag_documents';
const PAGE = 256;
const UPSERT_BATCH = 256;

/** A stable UUID (version 8, RFC 9562) for a document id. */
function pointId(id) {
  const h = crypto.createHash('sha256').update(String(id)).digest();
  h[6] = (h[6] & 0x0f) | 0x80;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

function checkVector(vector, id) {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error(`QdrantRetriever: document "${id}" has no vector`);
  }
  if (!vector.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    throw new Error(
      `QdrantRetriever: document "${id}" has a vector with a non-finite value`,
    );
  }
}

// Matches every point this class wrote, and nothing else in the collection.
const OURS = { must_not: [{ is_empty: { key: 'rag_id' } }] };

/**
 * Retriever on Qdrant over its REST API, with no client package. Creates
 * the collection on first store; similarity is cosine.
 */
class QdrantRetriever {
  /**
   * @param {Object} [options]
   * @param {string} [options.url='http://localhost:6333'] - Qdrant's REST endpoint
   * @param {string} [options.apiKey] - Sent as the `api-key` header
   * @param {string} [options.collection='rag_documents']
   * @param {number} [options.dimensions] - Vector size for a new collection; defaults to the first stored vector's
   * @param {boolean} [options.createCollection=true] - Create the collection on first store
   * @param {string} [options.cacheKey] - Cache identity; change it when the collection changes
   * @param {Function} [options.fetch] - fetch implementation (defaults to the global)
   */
  constructor(options = {}) {
    const {
      url = 'http://localhost:6333',
      apiKey,
      collection = DEFAULT_COLLECTION,
      dimensions,
      createCollection = true,
      cacheKey,
      fetch: fetchImpl = globalThis.fetch,
    } = options;
    if (!COLLECTION.test(collection)) {
      throw new Error(
        `QdrantRetriever: invalid collection name "${collection}" (letters, digits, "_" and "-")`,
      );
    }
    if (
      dimensions !== undefined &&
      !(Number.isInteger(dimensions) && dimensions > 0)
    ) {
      throw new Error(
        'QdrantRetriever: `dimensions` must be a positive integer',
      );
    }
    if (typeof fetchImpl !== 'function') {
      throw new Error('QdrantRetriever needs fetch (Node.js 18 or later)');
    }
    this.url = String(url).replace(/\/+$/, '');
    this.collection = collection;
    this.dimensions = dimensions;
    this.createCollection = createCollection;
    this.cacheKey = cacheKey;
    this._apiKey = apiKey;
    this._fetch = fetchImpl;
    this._ready = null;
  }

  /**
   * Cache identity for createRagPipeline({ cache }): none unless you set
   * `cacheKey`, since other clients can change the collection.
   * @param {'retriever'} role
   * @returns {string|null}
   */
  getCacheKey(role) {
    if (role !== 'retriever' || !this.cacheKey) return null;
    return `qdrant|${this.url}|${this.collection}|${this.cacheKey}`;
  }

  /**
   * One REST call to the collection; resolves Qdrant's `result`.
   * @private
   * @param {string} method
   * @param {string} path - After /collections/<name>
   * @param {Object} [body]
   * @param {{ signal?: AbortSignal, allow404?: boolean }} [options] - allow404 resolves null for a missing collection
   * @returns {Promise<any>}
   */
  async _request(method, path, body, { signal, allow404 = false } = {}) {
    throwIfAborted(signal);
    const headers = {
      'content-type': 'application/json',
      // fetch asks for gzip by default, and Qdrant's compressed responses
      // stall each request by about 40 ms; uncompressed they take ~1 ms.
      'accept-encoding': 'identity',
    };
    if (this._apiKey) headers['api-key'] = this._apiKey;
    let res;
    try {
      res = await this._fetch(
        `${this.url}/collections/${this.collection}${path}`,
        {
          method,
          headers,
          ...(body !== undefined && { body: JSON.stringify(body) }),
          ...(signal && { signal }),
        },
      );
    } catch (err) {
      throwIfAborted(signal);
      throw new Error(
        `QdrantRetriever: cannot reach Qdrant at ${this.url} (${err.message})`,
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
      const detail =
        (json.status && json.status.error) || text || res.statusText;
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `QdrantRetriever: Qdrant refused the request (${res.status}); check QDRANT_API_KEY`,
        );
      }
      throw new Error(
        `QdrantRetriever: ${method} ${path || '/'} failed (${res.status}): ${detail}`,
      );
    }
    return json.result;
  }

  _ensureCollection(dimensions) {
    if (!this.createCollection) return Promise.resolve();
    if (!this._ready) {
      this._ready = (async () => {
        const existing = await this._request('GET', '', undefined, {
          allow404: true,
        });
        if (!existing) {
          await this._request('PUT', '', {
            vectors: {
              size: this.dimensions || dimensions,
              distance: 'Cosine',
            },
          });
        }
        // removeBySource filters on metadata.source; index it.
        await this._request('PUT', '/index?wait=true', {
          field_name: 'metadata.source',
          field_schema: 'keyword',
        });
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
      throw new Error('QdrantRetriever.store() takes an array');
    if (docs.length === 0) return;
    let dimensions = null;
    const points = docs.map((doc) => {
      const id = doc && doc.id;
      if (typeof id !== 'string' || id.length === 0) {
        throw new Error(
          'QdrantRetriever.store(): every document needs a string id',
        );
      }
      checkVector(doc.vector, id);
      if (dimensions === null) dimensions = doc.vector.length;
      else if (doc.vector.length !== dimensions) {
        throw new Error(
          `QdrantRetriever.store(): document "${id}" has ${doc.vector.length} dimensions, the batch has ${dimensions}`,
        );
      }
      return {
        id: pointId(id),
        vector: doc.vector,
        payload: {
          rag_id: id,
          content: doc.content || '',
          metadata: doc.metadata || {},
        },
      };
    });
    await this._ensureCollection(dimensions);
    for (let i = 0; i < points.length; i += UPSERT_BATCH) {
      await this._request('PUT', '/points?wait=true', {
        points: points.slice(i, i + UPSERT_BATCH),
      });
    }
  }

  /**
   * The documents most similar to a query vector.
   * @param {number[]|{ queryVector: number[], topK?: number, signal?: AbortSignal }} request
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
        'QdrantRetriever.retrieve(): topK must be a positive integer',
      );
    }
    checkVector(queryVector, 'query');
    const result = await this._request(
      'POST',
      '/points/query',
      { query: queryVector, limit: topK, with_payload: true, filter: OURS },
      { signal, allow404: true },
    );
    throwIfAborted(signal);
    return ((result && result.points) || []).map((p) => ({
      id: p.payload.rag_id,
      score: p.score,
      content: p.payload.content || '',
      metadata: p.payload.metadata || {},
    }));
  }

  /**
   * Deletes the chunks of one source (`metadata.source`), for re-ingesting.
   * @param {string} source
   */
  async removeBySource(source) {
    await this._request(
      'POST',
      '/points/delete?wait=true',
      {
        filter: {
          must: [{ key: 'metadata.source', match: { value: String(source) } }],
        },
      },
      { allow404: true },
    );
  }

  /**
   * Deletes documents by id.
   * @param {string[]} ids
   */
  async delete(ids) {
    await this._request(
      'POST',
      '/points/delete?wait=true',
      { points: ids.map(pointId) },
      { allow404: true },
    );
  }

  /** Deletes every document this class stored; the collection stays. */
  async clear() {
    await this._request(
      'POST',
      '/points/delete?wait=true',
      { filter: OURS },
      { allow404: true },
    );
  }

  /** @returns {Promise<number>} */
  async size() {
    const result = await this._request(
      'POST',
      '/points/count',
      { exact: true, filter: OURS },
      { allow404: true },
    );
    return result ? result.count : 0;
  }

  /**
   * Every document, without vectors.
   * @param {{ limit?: number }} [options]
   * @returns {Promise<Array<{ id: string, content: string, metadata: Object }>>}
   */
  async list({ limit } = {}) {
    const out = [];
    let offset;
    do {
      const result = await this._request(
        'POST',
        '/points/scroll',
        {
          limit: limit ? Math.min(PAGE, limit - out.length) : PAGE,
          with_payload: true,
          with_vector: false,
          filter: OURS,
          ...(offset !== undefined && offset !== null && { offset }),
        },
        { allow404: true },
      );
      if (!result) break;
      for (const p of result.points) {
        out.push({
          id: p.payload.rag_id,
          content: p.payload.content || '',
          metadata: p.payload.metadata || {},
        });
      }
      offset = result.next_page_offset;
    } while (
      offset !== undefined &&
      offset !== null &&
      (!limit || out.length < limit)
    );
    return out;
  }
}

module.exports = { QdrantRetriever, pointId };
