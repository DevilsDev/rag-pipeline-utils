'use strict';

const { BaseConnector } = require('./base-connector');
const { throwIfAborted } = require('./connector-utils');

/**
 * Default configuration for the in-memory retriever.
 * @type {Object}
 */
const DEFAULT_CONFIG = {
  maxDocuments: 100000,
  // 'error' rejects a store() that would exceed maxDocuments; 'fifo' evicts
  // the oldest documents (insertion order) to make room.
  eviction: 'error',
};

/**
 * In-memory vector store with cosine similarity retrieval.
 * Stores document vectors and retrieves the most similar ones to a query vector.
 * All vectors in one store must have the same dimension.
 * @extends BaseConnector
 */
class MemoryRetriever extends BaseConnector {
  /**
   * @param {Object} options
   * @param {number} [options.maxDocuments=100000] - Maximum number of documents to store
   * @param {'error'|'fifo'} [options.eviction='error'] - What to do when a store()
   *   would exceed maxDocuments: throw (default) or evict the oldest documents
   */
  constructor(options = {}) {
    super({ name: 'memory-retriever', ...options });
    this.config = { ...DEFAULT_CONFIG, ...options };
    if (!['error', 'fifo'].includes(this.config.eviction)) {
      throw new Error(
        `MemoryRetriever: unknown eviction "${this.config.eviction}" (use "error" or "fifo")`,
      );
    }
    /** @type {Map<string, { vector: number[], metadata?: Object, content?: string }>} */
    this.documents = new Map();
    /** @type {number|null} Vector dimension, fixed by the first stored vector */
    this.dimensions = null;
    this.connected = true;
  }

  /**
   * Store one or more vector documents. The batch is validated before
   * anything is inserted, so a rejected call leaves the store unchanged.
   *
   * @param {Array<{ id: string, vector: number[], metadata?: Object, content?: string }>} vectors
   * @returns {Promise<void>}
   * @throws {Error} When a vector's dimension differs from the store's, or
   *   (eviction 'error') when the store would exceed maxDocuments
   */
  async store(vectors) {
    let dimensions = this.dimensions;
    const newIds = new Set();
    for (const doc of vectors) {
      const length = doc && doc.vector ? doc.vector.length : undefined;
      if (typeof length !== 'number') {
        throw new Error(
          `MemoryRetriever.store(): document "${doc && doc.id}" has no vector`,
        );
      }
      if (dimensions === null) {
        dimensions = length;
      } else if (length !== dimensions) {
        throw new Error(
          `MemoryRetriever.store(): document "${doc.id}" has ${length} dimensions ` +
            `but the store holds ${dimensions}-dimension vectors. Use the same embedder for all documents.`,
        );
      }
      if (!this.documents.has(doc.id)) newIds.add(doc.id);
    }

    const { maxDocuments, eviction } = this.config;
    const projected = this.documents.size + newIds.size;
    if (projected > maxDocuments) {
      if (eviction !== 'fifo') {
        throw new Error(
          `MemoryRetriever.store(): storing ${newIds.size} new document(s) would bring the ` +
            `total to ${projected}, exceeding maxDocuments (${maxDocuments}). Raise ` +
            'maxDocuments, call clear(), or construct with { eviction: \'fifo\' }.',
        );
      }
      if (newIds.size > maxDocuments) {
        throw new Error(
          `MemoryRetriever.store(): batch of ${newIds.size} new documents exceeds maxDocuments (${maxDocuments})`,
        );
      }
    }

    for (const doc of vectors) {
      this.documents.set(doc.id, {
        vector: doc.vector,
        metadata: doc.metadata || {},
        content: doc.content || '',
      });
    }
    if (vectors.length > 0) this.dimensions = dimensions;

    let evicted = 0;
    if (this.documents.size > maxDocuments) {
      // FIFO eviction: Map iteration follows insertion order. Never evict a
      // document from the current batch.
      for (const id of this.documents.keys()) {
        if (this.documents.size <= maxDocuments) break;
        if (newIds.has(id)) continue;
        this.documents.delete(id);
        evicted++;
      }
      this.emit('evicted', { count: evicted, total: this.documents.size });
    }

    this.emit('stored', { count: vectors.length, total: this.documents.size });
  }

  /**
   * Retrieve the top-k most similar documents to a query vector.
   * @param {number[]|{ query?: string, queryVector: number[], topK?: number, signal?: AbortSignal }} queryOrObj
   *   Either a raw vector array or an object with queryVector, optional topK
   *   and optional AbortSignal.
   * @param {number} [k=10] - Number of results to return (used when queryOrObj is an array)
   * @returns {Promise<Array<{ id: string, score: number, metadata: Object, content: string }>>}
   * @throws {Error} When the query vector's dimension differs from the stored vectors
   */
  async retrieve(queryOrObj, k = 10) {
    let queryVector;
    let topK = k;
    let signal;

    if (Array.isArray(queryOrObj)) {
      queryVector = queryOrObj;
    } else {
      queryVector = queryOrObj?.queryVector;
      topK = queryOrObj?.topK || k;
      signal = queryOrObj?.signal;
    }

    throwIfAborted(signal);

    if (!Array.isArray(queryVector) && !ArrayBuffer.isView(queryVector)) {
      throw new Error(
        'MemoryRetriever.retrieve(): queryVector is required. Pass an ' +
          '`embedder` to createRagPipeline or supply `queryVector` to run().',
      );
    }

    if (this.dimensions !== null && this.documents.size > 0) {
      if (queryVector.length !== this.dimensions) {
        throw new Error(
          `Query vector has ${queryVector.length} dimensions but the store holds ` +
            `${this.dimensions}-dimension vectors. Use the same embedder for queries and documents.`,
        );
      }
    }

    const results = [];

    for (const [id, doc] of this.documents) {
      const score = this._cosineSimilarity(queryVector, doc.vector);
      results.push({
        id,
        score,
        metadata: doc.metadata,
        content: doc.content,
      });
    }

    results.sort((a, b) => b.score - a.score);

    throwIfAborted(signal);
    return results.slice(0, topK);
  }

  /**
   * Compute cosine similarity between two vectors of equal length.
   * @param {number[]} a - First vector
   * @param {number[]} b - Second vector
   * @returns {number} Cosine similarity in the range [-1, 1], or 0 for zero vectors
   * @throws {Error} When the vectors have different lengths
   * @private
   */
  _cosineSimilarity(a, b) {
    if (a.length !== b.length) {
      throw new Error(
        `Cannot compare vectors of different dimensions (${a.length} vs ${b.length})`,
      );
    }
    let dot = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
    if (magnitude === 0) return 0;

    return dot / magnitude;
  }

  /**
   * Remove all stored documents and reset the vector dimension.
   * @returns {Promise<void>}
   */
  async clear() {
    this.documents.clear();
    this.dimensions = null;
  }

  /**
   * Get statistics about the store.
   * @returns {{ documentCount: number, maxDocuments: number, dimensions: number|null }}
   */
  getStats() {
    return {
      documentCount: this.documents.size,
      maxDocuments: this.config.maxDocuments,
      dimensions: this.dimensions,
    };
  }

  /**
   * Connect the retriever (always succeeds since it is in-memory).
   * @returns {Promise<void>}
   */
  async connect() {
    this.connected = true;
  }

  /**
   * Check whether the retriever is healthy (always true).
   * @returns {Promise<boolean>}
   */
  async isHealthy() {
    return true;
  }
}

module.exports = { MemoryRetriever, DEFAULT_CONFIG };
