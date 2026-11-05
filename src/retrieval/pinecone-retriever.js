'use strict';

/**
 * Retriever on Pinecone, through its REST API with the built-in fetch: no
 * client package is needed. Written against API version 2026-07 on a
 * serverless index.
 *
 * The retriever owns a namespace of the index (default `rag_documents`):
 * clear() deletes everything in it. Pinecone metadata is flat, so each
 * record keeps the document's id (`rag_id`), content (`rag_content`),
 * metadata as JSON (`rag_metadata`) and `metadata.source` (`rag_source`,
 * for removeBySource). A record's metadata is limited to 40 KB.
 *
 * Pinecone is eventually consistent. Like QdrantRetriever's `wait=true`,
 * reads wait until this retriever's own writes are indexed: each write
 * returns a log sequence number, and each query the highest one it
 * reflects (Pinecone's "check data freshness"), up to `freshnessTimeoutMs`.
 *
 * The index can change without this process knowing, so the retriever has
 * no cache identity unless you give it a `cacheKey`.
 */

const crypto = require('crypto');
const { throwIfAborted } = require('../connectors/connector-utils');

const API_VERSION = '2026-07';
const CONTROL_PLANE = 'https://api.pinecone.io';
const DEFAULT_NAMESPACE = 'rag_documents';
const UPSERT_BATCH = 100;
const DELETE_BATCH = 1000;
const LIST_PAGE = 100;
// Pinecone ids: 1 to 512 printable ASCII characters
const PLAIN_ID = /^[\x20-\x7e]{1,512}$/;

/** The record id for a document id: itself when Pinecone accepts it. */
function recordId(id) {
  const s = String(id);
  if (PLAIN_ID.test(s)) return s;
  return `rag-${crypto.createHash('sha256').update(s).digest('hex')}`;
}

function checkVector(vector, id) {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error(`PineconeRetriever: document "${id}" has no vector`);
  }
  if (!vector.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    throw new Error(
      `PineconeRetriever: document "${id}" has a vector with a non-finite value`,
    );
  }
}

function fromRecord(record) {
  const m = record.metadata || {};
  let metadata = {};
  try {
    metadata = m.rag_metadata ? JSON.parse(m.rag_metadata) : {};
  } catch {
    metadata = {};
  }
  return {
    id: m.rag_id !== undefined ? String(m.rag_id) : record.id,
    content: m.rag_content || '',
    metadata,
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retriever on a Pinecone serverless index over its REST API, with no
 * client package. The index must exist; its dimension and metric (cosine
 * for the scores the other retrievers return) are set when it is created.
 */
class PineconeRetriever {
  /**
   * @param {Object} options
   * @param {string} [options.apiKey] - Defaults to PINECONE_API_KEY
   * @param {string} [options.host] - The index host (from the console or describe_index); or give `index`
   * @param {string} [options.index] - The index name, resolved to its host on first use
   * @param {string} [options.namespace='rag_documents'] - A namespace this retriever owns
   * @param {number} [options.freshnessTimeoutMs=30000] - How long a read waits for this retriever's writes to be indexed; 0 to not wait
   * @param {string} [options.cacheKey] - Cache identity; change it when the index changes
   * @param {Function} [options.fetch] - fetch implementation (defaults to the global)
   */
  constructor(options = {}) {
    const {
      apiKey = typeof process !== 'undefined' && process.env
        ? process.env.PINECONE_API_KEY
        : undefined,
      host,
      index,
      namespace = DEFAULT_NAMESPACE,
      freshnessTimeoutMs = 30000,
      cacheKey,
      fetch: fetchImpl = globalThis.fetch,
    } = options;
    if (!apiKey) {
      throw new Error(
        'PineconeRetriever needs an API key: pass apiKey or set PINECONE_API_KEY',
      );
    }
    if (!host && !index) {
      throw new Error(
        'PineconeRetriever needs the index: pass host (the index host) or index (its name)',
      );
    }
    if (typeof namespace !== 'string') {
      throw new Error('PineconeRetriever: namespace must be a string');
    }
    if (typeof fetchImpl !== 'function') {
      throw new Error('PineconeRetriever needs fetch (Node.js 18 or later)');
    }
    this.index = index;
    this.namespace = namespace;
    this.freshnessTimeoutMs = freshnessTimeoutMs;
    this.cacheKey = cacheKey;
    this._apiKey = apiKey;
    this._host = host ? normalizeHost(host) : null;
    // Bound: Cloudflare Workers reject fetch called as another object's
    // method ("Illegal invocation").
    this._fetch =
      fetchImpl === globalThis.fetch ? fetchImpl.bind(globalThis) : fetchImpl;
    this._resolving = null;
    // The highest log sequence number of this retriever's writes
    this._writeLsn = 0;
    this._dimension = null;
  }

  /**
   * Cache identity for createRagPipeline({ cache }): none unless you set
   * `cacheKey`, since other clients can change the index.
   * @param {'retriever'} role
   * @returns {string|null}
   */
  getCacheKey(role) {
    if (role !== 'retriever' || !this.cacheKey) return null;
    return `pinecone|${this._host || this.index}|${this.namespace}|${this.cacheKey}`;
  }

  /** @private */
  async _hostUrl(signal) {
    if (this._host) return this._host;
    if (!this._resolving) {
      this._resolving = this._call(
        `${CONTROL_PLANE}/indexes/${encodeURIComponent(this.index)}`,
        'GET',
        undefined,
        signal,
      )
        .then(({ json }) => {
          if (!json.host) {
            throw new Error(
              `PineconeRetriever: index "${this.index}" has no host yet (is it ready?)`,
            );
          }
          this._host = normalizeHost(json.host);
          return this._host;
        })
        .catch((err) => {
          this._resolving = null;
          throw err;
        });
    }
    return this._resolving;
  }

  /**
   * One REST call; resolves the parsed body and the response headers.
   * @private
   */
  async _call(url, method, body, signal) {
    throwIfAborted(signal);
    const headers = {
      'Api-Key': this._apiKey,
      'X-Pinecone-Api-Version': API_VERSION,
      accept: 'application/json',
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    let res;
    try {
      res = await this._fetch(url, {
        method,
        headers,
        ...(body !== undefined && { body: JSON.stringify(body) }),
        ...(signal && { signal }),
      });
    } catch (err) {
      throwIfAborted(signal);
      throw new Error(
        `PineconeRetriever: cannot reach Pinecone (${err.message})`,
      );
    }
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
          `PineconeRetriever: Pinecone refused the request (${res.status}); check PINECONE_API_KEY`,
        );
      }
      const detail =
        json.message ||
        (json.error && json.error.message) ||
        text ||
        res.statusText;
      throw new Error(
        `PineconeRetriever: ${method} ${new URL(url).pathname} failed (${res.status}): ${detail}`,
      );
    }
    return { json, headers: res.headers };
  }

  /** A data-plane call; records the log sequence number of writes. @private */
  async _data(method, path, body, { signal, write = false } = {}) {
    const host = await this._hostUrl(signal);
    const result = await this._call(`${host}${path}`, method, body, signal);
    if (write) {
      const lsn = Number(result.headers.get('x-pinecone-request-lsn'));
      if (Number.isFinite(lsn) && lsn > this._writeLsn) this._writeLsn = lsn;
    }
    return result;
  }

  /**
   * A query, repeated until it reflects this retriever's writes (when the
   * index reports log sequence numbers) or `freshnessTimeoutMs` passes.
   * @private
   */
  async _query(body, signal) {
    const deadline = Date.now() + this.freshnessTimeoutMs;
    for (let delay = 100; ; delay = Math.min(delay * 2, 2000)) {
      const { json, headers } = await this._data('POST', '/query', body, {
        signal,
      });
      const header = headers.get('x-pinecone-max-indexed-lsn');
      // No writes to wait for, an index that doesn't report LSNs, caught
      // up, or out of time
      const fresh =
        !this._writeLsn ||
        header === null ||
        !(Number(header) < this._writeLsn) ||
        Date.now() + delay > deadline;
      if (fresh) return json;
      await sleep(delay);
      throwIfAborted(signal);
    }
  }

  /** Waits until this retriever's writes are indexed (for list and size). @private */
  async _waitForWrites(signal) {
    if (!this._writeLsn || !this._dimension) return;
    await this._query(
      {
        vector: new Array(this._dimension)
          .fill(0)
          .map((_, i) => (i === 0 ? 1 : 0)),
        topK: 1,
        namespace: this.namespace,
      },
      signal,
    );
  }

  /**
   * Inserts or replaces documents.
   * @param {Array<{ id: string, vector: number[], content?: string, metadata?: Object }>} docs
   * @returns {Promise<void>}
   */
  async store(docs) {
    if (!Array.isArray(docs)) {
      throw new Error('PineconeRetriever.store() takes an array');
    }
    if (docs.length === 0) return;
    let dimensions = null;
    const records = docs.map((doc) => {
      const id = doc && doc.id;
      if (typeof id !== 'string' || id.length === 0) {
        throw new Error(
          'PineconeRetriever.store(): every document needs a string id',
        );
      }
      checkVector(doc.vector, id);
      if (dimensions === null) dimensions = doc.vector.length;
      else if (doc.vector.length !== dimensions) {
        throw new Error(
          `PineconeRetriever.store(): document "${id}" has ${doc.vector.length} dimensions, the batch has ${dimensions}`,
        );
      }
      if (this._dimension && doc.vector.length !== this._dimension) {
        throw new Error(
          `PineconeRetriever.store(): document "${id}" has ${doc.vector.length} dimensions, the index has ${this._dimension}`,
        );
      }
      const metadata = doc.metadata || {};
      return {
        id: recordId(id),
        values: doc.vector,
        metadata: {
          rag_id: id,
          rag_content: doc.content || '',
          rag_metadata: JSON.stringify(metadata),
          ...(metadata.source !== undefined &&
            metadata.source !== null && {
              rag_source: String(metadata.source),
            }),
        },
      };
    });
    for (let i = 0; i < records.length; i += UPSERT_BATCH) {
      await this._data(
        'POST',
        '/vectors/upsert',
        {
          vectors: records.slice(i, i + UPSERT_BATCH),
          namespace: this.namespace,
        },
        { write: true },
      );
    }
    this._dimension = dimensions;
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
        'PineconeRetriever.retrieve(): topK must be a positive integer',
      );
    }
    checkVector(queryVector, 'query');
    throwIfAborted(signal);
    const json = await this._query(
      {
        vector: queryVector,
        topK: Math.min(topK, 10000),
        namespace: this.namespace,
        includeMetadata: true,
      },
      signal,
    );
    throwIfAborted(signal);
    return (json.matches || []).map((match) => ({
      ...fromRecord(match),
      score: match.score,
    }));
  }

  /**
   * Deletes the chunks of one source (`metadata.source`), for re-ingesting.
   * @param {string} source
   */
  async removeBySource(source) {
    await this._data(
      'POST',
      '/vectors/delete',
      {
        namespace: this.namespace,
        filter: { rag_source: { $eq: String(source) } },
      },
      { write: true },
    );
  }

  /**
   * Deletes documents by id.
   * @param {string[]} ids
   */
  async delete(ids) {
    const recordIds = ids.map(recordId);
    for (let i = 0; i < recordIds.length; i += DELETE_BATCH) {
      await this._data(
        'POST',
        '/vectors/delete',
        {
          ids: recordIds.slice(i, i + DELETE_BATCH),
          namespace: this.namespace,
        },
        { write: true },
      );
    }
  }

  /** Deletes every record in this retriever's namespace. */
  async clear() {
    try {
      await this._data(
        'POST',
        '/vectors/delete',
        { deleteAll: true, namespace: this.namespace },
        { write: true },
      );
    } catch (err) {
      // An empty (or never written) namespace doesn't exist yet
      if (!/\(404\)/.test(err.message)) throw err;
    }
  }

  /** @private */
  async _ids(limit) {
    await this._waitForWrites();
    const ids = [];
    let token;
    do {
      const params = new URLSearchParams({
        namespace: this.namespace,
        limit: String(LIST_PAGE),
      });
      if (token) params.set('paginationToken', token);
      let json;
      try {
        ({ json } = await this._data('GET', `/vectors/list?${params}`));
      } catch (err) {
        if (/\(404\)/.test(err.message)) break;
        throw err;
      }
      for (const v of json.vectors || []) ids.push(v.id);
      token = json.pagination && json.pagination.next;
    } while (token && (!limit || ids.length < limit));
    return limit ? ids.slice(0, limit) : ids;
  }

  /** @returns {Promise<number>} The records in this retriever's namespace */
  async size() {
    return (await this._ids()).length;
  }

  /**
   * Every document, without vectors.
   * @param {{ limit?: number }} [options]
   * @returns {Promise<Array<{ id: string, content: string, metadata: Object }>>}
   */
  async list({ limit } = {}) {
    const ids = await this._ids(limit);
    const out = [];
    for (let i = 0; i < ids.length; i += LIST_PAGE) {
      const params = new URLSearchParams({ namespace: this.namespace });
      for (const id of ids.slice(i, i + LIST_PAGE)) params.append('ids', id);
      const { json } = await this._data('GET', `/vectors/fetch?${params}`);
      for (const id of ids.slice(i, i + LIST_PAGE)) {
        const record = json.vectors && json.vectors[id];
        if (record) out.push(fromRecord(record));
      }
    }
    return out;
  }
}

function normalizeHost(host) {
  const h = String(host).replace(/\/+$/, '');
  return /^https?:\/\//.test(h) ? h : `https://${h}`;
}

module.exports = { PineconeRetriever, recordId, API_VERSION };
