'use strict';

/**
 * Retriever on Pinecone, through its REST API with the built-in fetch: no
 * client package is needed. Written against API version 2026-07 on
 * serverless indexes of both kinds:
 *
 * - document indexes (what Pinecone creates now), through the Documents API
 *   (`/namespaces/{namespace}/documents/...`), with the vectors in the
 *   schema's `dense_vector` field;
 * - vector indexes (created with a dimension and metric), through the
 *   vectors API (`/vectors/upsert`, `/query`, ...).
 *
 * Which one is read from the index description on first use (or set
 * `api`). An index that embeds text itself (integrated embedding) has no
 * field for your vectors and is refused.
 *
 * The retriever owns a namespace of the index (default `rag_documents`):
 * clear() deletes everything it stored there. Pinecone metadata is flat,
 * so each record keeps the document's id (`rag_id`), content
 * (`rag_content`), metadata as JSON (`rag_metadata`) and `metadata.source`
 * (`rag_source`, for removeBySource).
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
const PAGE = 100;
const SEARCH_MAX = 10000;
// Pinecone ids: 1 to 512 printable ASCII characters
const PLAIN_ID = /^[\x20-\x7e]{1,512}$/;
const FIELDS = ['rag_id', 'rag_content', 'rag_metadata'];
// Every record this class wrote, and nothing else
const OURS = { rag_id: { $exists: true } };

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

/** A document from a record's flat fields. */
function fromFields(fields, fallbackId) {
  const m = fields || {};
  let metadata = {};
  try {
    metadata = m.rag_metadata ? JSON.parse(m.rag_metadata) : {};
  } catch {
    metadata = {};
  }
  return {
    id: m.rag_id !== undefined ? String(m.rag_id) : fallbackId,
    content: m.rag_content || '',
    metadata,
  };
}

function normalizeHost(host) {
  // Trailing slashes off with a loop (a regex here can backtrack)
  let h = String(host);
  while (h.endsWith('/')) h = h.slice(0, -1);
  return /^https?:\/\//.test(h) ? h : `https://${h}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retriever on a Pinecone serverless index over its REST API, with no
 * client package. The index must exist, with a dense vector of your
 * embedding model's dimension; use the cosine metric for the scores the
 * other retrievers return.
 */
class PineconeRetriever {
  /**
   * @param {Object} options
   * @param {string} [options.apiKey] - Defaults to PINECONE_API_KEY
   * @param {string} [options.index] - The index name, described on first use
   * @param {string} [options.host] - The index host (from the console), instead of or with `index`
   * @param {string} [options.namespace='rag_documents'] - A namespace this retriever owns
   * @param {'auto'|'documents'|'vectors'} [options.api='auto'] - Document index (Documents API) or vector index; auto reads it from the index description
   * @param {string} [options.vectorField] - The document index's dense_vector field (default: the schema's)
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
      api = 'auto',
      vectorField,
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
        'PineconeRetriever needs the index: pass index (its name) or host (the index host)',
      );
    }
    if (typeof namespace !== 'string') {
      throw new Error('PineconeRetriever: namespace must be a string');
    }
    if (!['auto', 'documents', 'vectors'].includes(api)) {
      throw new Error(
        'PineconeRetriever: api must be "auto", "documents" or "vectors"',
      );
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
    this._api = api;
    this._vectorField = vectorField;
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
      const err = new Error(
        `PineconeRetriever: ${method} ${new URL(url).pathname} failed (${res.status}): ${detail}`,
      );
      err.status = res.status;
      throw err;
    }
    return { json, headers: res.headers };
  }

  /**
   * The index's host and kind, from its description (once): a document
   * index's dense_vector field and dimension, or a vector index's.
   * @private
   */
  _resolve(signal) {
    if (
      this._host &&
      this._api !== 'auto' &&
      (this._api === 'vectors' || this._vectorField)
    ) {
      return Promise.resolve();
    }
    if (!this._resolving) {
      this._resolving = this._describe(signal).catch((err) => {
        this._resolving = null;
        throw err;
      });
    }
    return this._resolving;
  }

  /** @private */
  async _describe(signal) {
    let info;
    if (this.index) {
      ({ json: info } = await this._call(
        `${CONTROL_PLANE}/indexes/${encodeURIComponent(this.index)}`,
        'GET',
        undefined,
        signal,
      ));
    } else {
      // Only the host: find the index it belongs to
      const { json } = await this._call(
        `${CONTROL_PLANE}/indexes`,
        'GET',
        undefined,
        signal,
      );
      const host = this._host.replace(/^https?:\/\//, '');
      info = (json.indexes || []).find((i) => i.host === host);
      if (!info) {
        throw new Error(
          `PineconeRetriever: no index with host ${host} in this project; check the host, or pass index (its name)`,
        );
      }
    }
    if (!info.host) {
      throw new Error(
        `PineconeRetriever: index "${info.name || this.index}" has no host yet (is it ready?)`,
      );
    }
    this._host = this._host || normalizeHost(info.host);

    const fields = (info.schema && info.schema.fields) || null;
    // A vector index describes itself with an implicit schema (`_values`,
    // `_sparse_values`); a document index's fields are named by its owner
    const named = fields
      ? Object.entries(fields).filter(([name]) => !name.startsWith('_'))
      : [];
    const denseFields = named.filter(([, f]) => f && f.type === 'dense_vector');
    if (this._api === 'auto') {
      this._api = named.length > 0 ? 'documents' : 'vectors';
    }
    if (this._api === 'documents') {
      const field = this._vectorField
        ? denseFields.find(([name]) => name === this._vectorField)
        : denseFields[0];
      if (!field) {
        const embeds =
          fields && Object.values(fields).some((f) => f && f.embed);
        throw new Error(
          embeds
            ? `PineconeRetriever: index "${info.name}" embeds text itself (integrated embedding) and has no dense_vector field for your vectors; create an index with a dense_vector field`
            : `PineconeRetriever: index "${info.name}" has no dense_vector field${this._vectorField ? ` named "${this._vectorField}"` : ''}`,
        );
      }
      this._vectorField = field[0];
      this._indexDimension = field[1].dimension;
    } else {
      const values = fields && fields._values;
      this._indexDimension = info.dimension || (values && values.dimension);
    }
  }

  /** A data-plane call; records the log sequence number of writes. @private */
  async _data(method, path, body, { signal, write = false } = {}) {
    await this._resolve(signal);
    const result = await this._call(
      `${this._host}${path}`,
      method,
      body,
      signal,
    );
    if (write) {
      const lsn = Number(result.headers.get('x-pinecone-request-lsn'));
      if (Number.isFinite(lsn) && lsn > this._writeLsn) this._writeLsn = lsn;
    }
    return result;
  }

  /** The Documents API path for this namespace. @private */
  _docs(action) {
    const ns = encodeURIComponent(this.namespace || '__default__');
    return `/namespaces/${ns}/documents/${action}`;
  }

  /**
   * A search, repeated until it reflects this retriever's writes (when the
   * index reports log sequence numbers) or `freshnessTimeoutMs` passes.
   * Resolves `[{ id, score, fields }]`.
   * @private
   */
  async _search(vector, topK, signal, filter) {
    await this._resolve(signal);
    const documents = this._api === 'documents';
    const [path, body] = documents
      ? [
          this._docs('search'),
          {
            score_by: [
              {
                type: 'dense_vector',
                fields: [this._vectorField],
                values: vector,
              },
            ],
            top_k: topK,
            include_fields: FIELDS,
            ...(filter && { filter }),
          },
        ]
      : [
          '/query',
          {
            vector,
            topK,
            namespace: this.namespace,
            includeMetadata: true,
            ...(filter && { filter }),
          },
        ];
    const deadline = Date.now() + this.freshnessTimeoutMs;
    for (let delay = 100; ; delay = Math.min(delay * 2, 2000)) {
      let json;
      let headers;
      try {
        ({ json, headers } = await this._data('POST', path, body, { signal }));
      } catch (err) {
        // A namespace nothing was written to yet
        if (err.status === 404) return [];
        throw err;
      }
      const header = headers.get('x-pinecone-max-indexed-lsn');
      // No writes to wait for, an index that doesn't report LSNs, caught
      // up, or out of time
      const fresh =
        !this._writeLsn ||
        header === null ||
        !(Number(header) < this._writeLsn) ||
        Date.now() + delay > deadline;
      if (fresh) {
        return (json.matches || []).map((m) =>
          documents
            ? { id: m._id, score: m._score, fields: m }
            : { id: m.id, score: m.score, fields: m.metadata },
        );
      }
      await sleep(delay);
      throwIfAborted(signal);
    }
  }

  /** Waits until this retriever's writes are indexed (for list and size). @private */
  async _waitForWrites(signal) {
    if (!this._writeLsn) return;
    const dimension = this._indexDimension || this._dimension;
    if (!dimension) return;
    await this._search(
      new Array(dimension).fill(0).map((_, i) => (i === 0 ? 1 : 0)),
      1,
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
    await this._resolve();
    const expected = this._indexDimension || this._dimension;
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
      if (expected && doc.vector.length !== expected) {
        throw new Error(
          `PineconeRetriever.store(): document "${id}" has ${doc.vector.length} dimensions, the index has ${expected}`,
        );
      }
      const metadata = doc.metadata || {};
      return {
        id: recordId(id),
        values: doc.vector,
        fields: {
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
      const batch = records.slice(i, i + UPSERT_BATCH);
      if (this._api === 'documents') {
        await this._data(
          'POST',
          this._docs('upsert'),
          {
            documents: batch.map((r) => ({
              _id: r.id,
              [this._vectorField]: r.values,
              ...r.fields,
            })),
          },
          { write: true },
        );
      } else {
        await this._data(
          'POST',
          '/vectors/upsert',
          {
            vectors: batch.map((r) => ({
              id: r.id,
              values: r.values,
              metadata: r.fields,
            })),
            namespace: this.namespace,
          },
          { write: true },
        );
      }
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
    const matches = await this._search(
      queryVector,
      Math.min(topK, 10000),
      signal,
    );
    throwIfAborted(signal);
    // Pinecone can return a record twice; keep the first
    const seen = new Set();
    const out = [];
    for (const m of matches) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push({ ...fromFields(m.fields, m.id), score: m.score });
    }
    return out;
  }

  /** @private */
  async _delete(body) {
    await this._resolve();
    try {
      if (this._api === 'documents') {
        await this._data('POST', this._docs('delete'), body.documents, {
          write: true,
        });
      } else {
        await this._data(
          'POST',
          '/vectors/delete',
          { namespace: this.namespace, ...body.vectors },
          { write: true },
        );
      }
    } catch (err) {
      // A namespace nothing was written to yet
      if (err.status !== 404) throw err;
    }
  }

  /**
   * Deletes the chunks of one source (`metadata.source`), for re-ingesting.
   * @param {string} source
   */
  async removeBySource(source) {
    const filter = { rag_source: { $eq: String(source) } };
    await this._delete({ documents: { filter }, vectors: { filter } });
  }

  /**
   * Deletes documents by id.
   * @param {string[]} ids
   */
  async delete(ids) {
    const recordIds = ids.map(recordId);
    for (let i = 0; i < recordIds.length; i += DELETE_BATCH) {
      const batch = recordIds.slice(i, i + DELETE_BATCH);
      await this._delete({
        documents: { ids: batch },
        vectors: { ids: batch },
      });
    }
  }

  /** Deletes every document this retriever stored in its namespace. */
  async clear() {
    // A document index's delete_all returns no log sequence number to wait
    // for, so it deletes this class's records by filter instead
    await this._delete({
      documents: { filter: OURS },
      vectors: { deleteAll: true },
    });
  }

  /**
   * Every document, without vectors.
   * @param {{ limit?: number }} [options]
   * @returns {Promise<Array<{ id: string, content: string, metadata: Object }>>}
   */
  async list({ limit } = {}) {
    await this._resolve();
    await this._waitForWrites();
    return this._api === 'documents'
      ? this._listDocuments(limit)
      : this._listVectors(limit);
  }

  /** @returns {Promise<number>} The documents this retriever stored */
  async size() {
    return (await this.list()).length;
  }

  /** Documents API: fetch by filter, page by page. @private */
  async _listDocuments(limit) {
    // A search reflects this retriever's writes (it waits for them); a fetch
    // by filter lags behind by seconds and reports no log sequence number.
    // So: every record this class wrote, by search, when they number fewer
    // than a search returns; otherwise page through fetch.
    const dimension = this._indexDimension || this._dimension;
    if (dimension) {
      const max = Math.min(limit || SEARCH_MAX, SEARCH_MAX);
      const found = await this._search(
        new Array(dimension).fill(0).map((_, i) => (i === 0 ? 1 : 0)),
        max,
        undefined,
        OURS,
      );
      if (found.length < SEARCH_MAX || limit) {
        const seen = new Set();
        return found
          .filter((m) => !seen.has(m.id) && seen.add(m.id))
          .map((m) => fromFields(m.fields, m.id));
      }
    }
    const out = [];
    let token;
    do {
      let json;
      try {
        ({ json } = await this._data('POST', this._docs('fetch'), {
          filter: OURS,
          include_fields: FIELDS,
          limit: limit ? Math.min(PAGE, limit - out.length) : PAGE,
          ...(token && { pagination_token: token }),
        }));
      } catch (err) {
        if (err.status === 404) break;
        throw err;
      }
      for (const [id, fields] of Object.entries(json.documents || {})) {
        out.push(fromFields(fields, id));
      }
      token = json.pagination && json.pagination.next;
    } while (token && (!limit || out.length < limit));
    return limit ? out.slice(0, limit) : out;
  }

  /** Vectors API: list ids, then fetch them. @private */
  async _listVectors(limit) {
    const ids = [];
    let token;
    do {
      const params = new URLSearchParams({
        namespace: this.namespace,
        limit: String(PAGE),
      });
      if (token) params.set('paginationToken', token);
      let json;
      try {
        ({ json } = await this._data('GET', `/vectors/list?${params}`));
      } catch (err) {
        if (err.status === 404) break;
        throw err;
      }
      for (const v of json.vectors || []) ids.push(v.id);
      token = json.pagination && json.pagination.next;
    } while (token && (!limit || ids.length < limit));
    const wanted = limit ? ids.slice(0, limit) : ids;
    const out = [];
    for (let i = 0; i < wanted.length; i += PAGE) {
      const params = new URLSearchParams({ namespace: this.namespace });
      for (const id of wanted.slice(i, i + PAGE)) params.append('ids', id);
      const { json } = await this._data('GET', `/vectors/fetch?${params}`);
      for (const id of wanted.slice(i, i + PAGE)) {
        const record = json.vectors && json.vectors[id];
        if (record) out.push(fromFields(record.metadata, id));
      }
    }
    return out;
  }
}

module.exports = { PineconeRetriever, recordId, API_VERSION };
