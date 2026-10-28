'use strict';

const fs = require('fs');
const path = require('path');

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
      return this._index;
    }
    const parsed = JSON.parse(fs.readFileSync(this.path, 'utf8'));
    if (parsed.version !== FORMAT_VERSION || !parsed.documents) {
      throw new Error(
        `Unsupported index format in ${this.path} (version ${parsed.version})`,
      );
    }
    this._index = parsed;
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

  /** @param {{name: string, dimensions: number, state?: object}} info */
  setEmbedderInfo(info) {
    this.load().embedder = info;
  }

  /**
   * Add or replace documents. Ids are caller-chosen; re-storing an id
   * replaces the previous entry.
   *
   * @param {Array<{id: string, vector: number[], content: string, metadata?: object}>} docs
   */
  async store(docs) {
    const { documents } = this.load();
    for (const doc of docs) {
      if (!doc.id || !Array.isArray(doc.vector)) {
        throw new Error(
          'FileVectorStore.store(): each doc needs id and vector',
        );
      }
      documents[doc.id] = {
        vector: doc.vector,
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
    this._index = this._emptyIndex();
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

    const results = Object.entries(this.load().documents).map(([id, doc]) => ({
      id,
      score: cosine(queryVector, doc.vector),
      content: doc.content,
      metadata: doc.metadata,
    }));
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
}

function cosine(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  return magnitude === 0 ? 0 : dot / magnitude;
}

module.exports = { FileVectorStore };
