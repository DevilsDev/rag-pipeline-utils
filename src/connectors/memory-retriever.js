"use strict";

const { BaseConnector } = require("./base-connector");

/**
 * Default configuration for the in-memory retriever.
 * @type {Object}
 */
const DEFAULT_CONFIG = {
  maxDocuments: 100000,
};

/**
 * In-memory vector store with cosine similarity retrieval.
 * Stores document vectors and retrieves the most similar ones to a query vector.
 * @extends BaseConnector
 */
class MemoryRetriever extends BaseConnector {
  /**
   * @param {Object} options
   * @param {number} [options.maxDocuments=100000] - Maximum number of documents to store
   */
  constructor(options = {}) {
    super({ name: "memory-retriever", ...options });
    this.config = { ...DEFAULT_CONFIG, ...options };
    /** @type {Map<string, { vector: number[], metadata?: Object, content?: string }>} */
    this.documents = new Map();
    this.connected = true;
  }

  /**
   * Store one or more vector documents.
   * @param {Array<{ id: string, vector: number[], metadata?: Object, content?: string }>} vectors
   * @returns {Promise<void>}
   */
  async store(vectors) {
    for (const doc of vectors) {
      this.documents.set(doc.id, {
        vector: doc.vector,
        metadata: doc.metadata || {},
        content: doc.content || "",
      });
    }

    if (this.documents.size > this.config.maxDocuments) {
      this.emit("warning", {
        message: `Document count (${this.documents.size}) exceeds maxDocuments (${this.config.maxDocuments})`,
      });
    }

    this.emit("stored", { count: vectors.length, total: this.documents.size });
  }

  /**
   * Retrieve the top-k most similar documents to a query vector.
   * @param {number[]|{ query?: string, queryVector: number[], topK?: number }} queryOrObj
   *   Either a raw vector array or an object with queryVector and optional topK.
   * @param {number} [k=10] - Number of results to return (used when queryOrObj is an array)
   * @returns {Promise<Array<{ id: string, score: number, metadata: Object, content: string }>>}
   */
  async retrieve(queryOrObj, k = 10) {
    let queryVector;
    let topK = k;

    if (Array.isArray(queryOrObj)) {
      queryVector = queryOrObj;
    } else {
      queryVector = queryOrObj.queryVector;
      topK = queryOrObj.topK || k;
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

    return results.slice(0, topK);
  }

  /**
   * Compute cosine similarity between two vectors.
   * @param {number[]} a - First vector
   * @param {number[]} b - Second vector
   * @returns {number} Cosine similarity in the range [-1, 1], or 0 for zero vectors
   * @private
   */
  _cosineSimilarity(a, b) {
    const len = Math.min(a.length, b.length);
    let dot = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
    if (magnitude === 0) return 0;

    return dot / magnitude;
  }

  /**
   * Remove all stored documents.
   * @returns {Promise<void>}
   */
  async clear() {
    this.documents.clear();
  }

  /**
   * Get statistics about the store.
   * @returns {{ documentCount: number, maxDocuments: number }}
   */
  getStats() {
    return {
      documentCount: this.documents.size,
      maxDocuments: this.config.maxDocuments,
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
