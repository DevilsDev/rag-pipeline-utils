'use strict';

const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const { digest } = require('../cache/component-keys');

const FORMAT_VERSION = 1;

/**
 * Vector store persisted to a single JSON file, so separate processes (e.g.
 * `rag-pipeline ingest` then `rag-pipeline query`) share one index. Intended
 * for local use and small corpora: every query is a linear scan.
 *
 * The index records which embedder produced the vectors (name, dimensions and
 * optional serialized state) and refuses queries whose vector dimension does
 * not match, instead of silently comparing incompatible vectors.
 */
class FileVectorStore {
  /**
   * @param {object} options
   * @param {string} options.path - Index file location
   */
  constructor(options = {}) {
    if (!options.path) {
      throw new Error('FileVectorStore requires a `path` option');
    }
    this.path = path.resolve(options.path);
    this._index = null;
    this._loadedDigest = null;
    this._cacheId = randomBytes(8).toString('hex');
    this._revision = 0;
  }

  /**
   * Cache identity for createRagPipeline({ cache }): a digest of the index
   * as loaded, so processes reading the same unchanged index share cached
   * results; after this instance changes the index the key also carries the
   * instance and a revision.
   * @param {'retriever'} role
   * @returns {string|null}
   */
  getCacheKey(role) {
    if (role !== 'retriever') return null;
    this.load();
    return this._revision === 0
      ? `file|${this._loadedDigest}`
      : `file|${this._loadedDigest}|${this._cacheId}|${this._revision}`;
  }

  _emptyIndex() {
    return { version: FORMAT_VERSION, embedder: null, documents: {} };
  }

  /**
   * Read the index from disk (cached after the first call).
   * @returns {{version: number, embedder: object|null, documents: object}}
   */
  load() {
    if (this._index) return this._index;
    if (!fs.existsSync(this.path)) {
      this._index = this._emptyIndex();
      this._loadedDigest = 'empty';
      return this._index;
    }
    const raw = fs.readFileSync(this.path, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.version !== FORMAT_VERSION || !parsed.documents) {
      throw new Error(
        `Unsupported index format in ${this.path} (version ${parsed.version})`,
      );
    }
    this._index = parsed;
    this._loadedDigest = digest(raw);
    return this._index;
  }

  /** Write the index atomically: temp file in the same directory, then rename. */
  save() {
    const index = this.load();
    fs.mkdirSync(path.dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(index));
    fs.renameSync(tmp, this.path);
  }

  /** @returns {object|null} Embedder metadata recorded with the vectors */
  getEmbedderInfo() {
    return this.load().embedder;
  }

  /**
   * Records which embedder wrote the index, saved with it.
   * @param {{name: string, dimensions: number, state?: object}} info
   */
  setEmbedderInfo(info) {
    this.load().embedder = info;
    this._revision += 1;
  }

  /**
   * Add or replace documents. Ids are caller-chosen; re-storing an id
   * replaces the previous entry.
   *
   * @param {Array<{id: string, vector: number[], content: string, metadata?: object}>} docs
   */
  async store(docs) {
    const { documents } = this.load();
    this._revision += 1;
    for (const doc of docs) {
      if (!doc.id || !Array.isArray(doc.vector)) {
        throw new Error(
          'FileVectorStore.store(): each doc needs id and vector',
        );
      }
      documents[doc.id] = {
        vector: encodeVector(doc.vector),
        content: doc.content || '',
        metadata: doc.metadata || {},
      };
    }
  }

  /**
   * Remove every document whose metadata.source equals `source`.
   * @param {string} source
   * @returns {number} Number of documents removed
   */
  removeBySource(source) {
    const { documents } = this.load();
    this._revision += 1;
    let removed = 0;
    for (const [id, doc] of Object.entries(documents)) {
      if (doc.metadata?.source === source) {
        delete documents[id];
        removed++;
      }
    }
    return removed;
  }

  /** Remove every document and the recorded embedder info. */
  clear() {
    this.load();
    this._index = this._emptyIndex();
    this._revision += 1;
  }

  /** @returns {Array<{id: string, content: string, metadata: object}>} */
  list() {
    return Object.entries(this.load().documents).map(([id, doc]) => ({
      id,
      content: doc.content,
      metadata: doc.metadata,
    }));
  }

  /** @returns {number} */
  size() {
    return Object.keys(this.load().documents).length;
  }

  /**
   * Cosine-similarity search.
   *
   * @param {{queryVector: number[], topK?: number}} request
   * @returns {Promise<Array<{id: string, score: number, content: string, metadata: object}>>}
   */
  async retrieve(request = {}) {
    const { queryVector, topK = 5 } = request;
    if (!Array.isArray(queryVector)) {
      throw new Error(
        'FileVectorStore.retrieve(): queryVector is required. Configure an embedder stage.',
      );
    }
    const info = this.getEmbedderInfo();
    if (info && info.dimensions && info.dimensions !== queryVector.length) {
      throw new Error(
        `Query vector has ${queryVector.length} dimensions but the index was built ` +
          `with ${info.dimensions} (embedder "${info.name}"). Re-run ingest with the ` +
          'current embedder.',
      );
    }

    const queryMagnitude = Math.sqrt(
      queryVector.reduce((sum, x) => sum + x * x, 0),
    );
    const results = Object.entries(this.load().documents).map(([id, doc]) => ({
      id,
      score: cosine(queryVector, queryMagnitude, doc.vector),
      content: doc.content,
      metadata: doc.metadata,
    }));
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
}

// Stored vectors keep ~7 significant digits; more only inflates the file.
const round = (x) => Number(x.toPrecision(7));

/**
 * Mostly-zero vectors (e.g. LocalEmbedder's TF-IDF over a large vocabulary)
 * are stored sparsely as { n, i, v }; dense ones as plain arrays.
 */
function encodeVector(vector) {
  const indices = [];
  const values = [];
  for (let i = 0; i < vector.length; i++) {
    if (vector[i] !== 0) {
      indices.push(i);
      values.push(round(vector[i]));
    }
  }
  if (indices.length < vector.length / 4) {
    return { n: vector.length, i: indices, v: values };
  }
  return vector.map(round);
}

/** Cosine similarity between a dense query and a stored (dense or sparse) vector. */
function cosine(query, magQuery, stored) {
  const sparse = !Array.isArray(stored);
  const length = sparse ? stored.n : stored.length;
  if (query.length !== length) return 0;

  let dot = 0;
  let magStored = 0;
  if (sparse) {
    for (let k = 0; k < stored.i.length; k++) {
      dot += query[stored.i[k]] * stored.v[k];
      magStored += stored.v[k] * stored.v[k];
    }
  } else {
    for (let k = 0; k < length; k++) {
      dot += query[k] * stored[k];
      magStored += stored[k] * stored[k];
    }
  }
  const magnitude = Math.sqrt(magQuery) * Math.sqrt(magStored);
  return magnitude === 0 ? 0 : dot / magnitude;
}

module.exports = { FileVectorStore };
