'use strict';

/**
 * Version: 1.1.0
 * Path: /src/reranker/embedding-reranker.js
 * Description: Cosine similarity reranker using any embedder
 * Author: Ali Kahwaji
 */

const { EventEmitter } = require('events');
const { createHash } = require('crypto');
const { throwIfAborted, raceAbort } = require('../connectors/connector-utils');

/** @type {{ cacheSize: number, concurrency: number }} */
const DEFAULT_CONFIG = {
  // Maximum number of document embeddings kept in the LRU cache (0 disables).
  cacheSize: 1000,
  // Maximum number of document embedding calls in flight at once.
  concurrency: 4,
};

/**
 * Hash document text so cache keys stay small regardless of document size.
 * @param {string} text
 * @returns {string}
 */
function contentHash(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Reranks documents by computing cosine similarity between query and
 * document embeddings produced by an external embedder.
 * Implements the reranker contract: rerank(query, documents, options).
 *
 * Document embeddings are cached in a bounded LRU keyed by a SHA-256 of the
 * document text, and embedding calls run with bounded concurrency.
 *
 * @extends EventEmitter
 */
class EmbeddingReranker extends EventEmitter {
  /**
   * @param {object} embedder - Must expose .embedQuery(text) or .embed(text)
   * @param {object} [options]
   * @param {number} [options.cacheSize=1000] - Max cached document embeddings (0 disables caching)
   * @param {number} [options.concurrency=4] - Max concurrent embedding calls
   */
  constructor(embedder, options = {}) {
    super();
    if (!embedder) {
      throw new Error('EmbeddingReranker requires an embedder instance');
    }
    this.embedder = embedder;
    this.config = { ...DEFAULT_CONFIG, ...options };
    if (
      !(
        Number.isInteger(this.config.concurrency) && this.config.concurrency > 0
      )
    ) {
      throw new Error(
        'EmbeddingReranker: concurrency must be a positive integer',
      );
    }
    /** @type {Map<string, Promise<number[]>>} LRU: oldest entry first */
    this._cache = new Map();
    this.cacheStats = { hits: 0, misses: 0 };
  }

  /**
   * Call the embedder, forwarding the signal only when one is given.
   * @private
   */
  _embed(text, signal) {
    const fn = this.embedder.embedQuery ? 'embedQuery' : 'embed';
    return signal
      ? this.embedder[fn](text, { signal })
      : this.embedder[fn](text);
  }

  /**
   * Embed a document, using the LRU cache. In-flight promises are cached so
   * duplicate documents in one batch are embedded once; failed embeddings
   * are evicted so they can be retried.
   * @private
   */
  _embedDocument(text, signal) {
    const { cacheSize } = this.config;
    if (!cacheSize || cacheSize <= 0) {
      this.cacheStats.misses++;
      return Promise.resolve().then(() => this._embed(text, signal));
    }

    const key = contentHash(text);
    const cached = this._cache.get(key);
    if (cached) {
      this.cacheStats.hits++;
      // Refresh recency.
      this._cache.delete(key);
      this._cache.set(key, cached);
      return cached;
    }

    this.cacheStats.misses++;
    const promise = Promise.resolve().then(() => this._embed(text, signal));
    this._cache.set(key, promise);
    promise.catch(() => {
      if (this._cache.get(key) === promise) this._cache.delete(key);
    });
    while (this._cache.size > cacheSize) {
      this._cache.delete(this._cache.keys().next().value);
    }
    return promise;
  }

  /**
   * Clear the document embedding cache.
   */
  clearCache() {
    this._cache.clear();
    this.cacheStats = { hits: 0, misses: 0 };
  }

  /**
   * Rerank documents by cosine similarity to the query embedding.
   *
   * @param {string} query - The search query
   * @param {Array<object|string>} documents - Documents to rerank
   * @param {object} [options]
   * @param {number} [options.topK] - Maximum number of results to return
   * @param {AbortSignal} [options.signal] - Cancels pending embedding calls
   * @returns {Promise<object[]>} Reranked documents with .relevanceScore
   */
  async rerank(query, documents, options = {}) {
    if (!Array.isArray(documents) || documents.length === 0) {
      return [];
    }

    const { topK = documents.length, signal } = options;
    throwIfAborted(signal);

    const queryEmbedding = await raceAbort(
      Promise.resolve().then(() => this._embed(query, signal)),
      signal,
    );

    // Embed documents with at most `concurrency` calls in flight, keeping
    // results in input order.
    const embeddings = new Array(documents.length);
    let next = 0;
    const worker = async () => {
      while (next < documents.length) {
        throwIfAborted(signal);
        const i = next++;
        const doc = documents[i];
        const text = doc.content || doc.text || String(doc);
        embeddings[i] = await raceAbort(
          this._embedDocument(text, signal),
          signal,
        );
      }
    };
    const workers = [];
    const poolSize = Math.min(this.config.concurrency, documents.length);
    for (let w = 0; w < poolSize; w++) workers.push(worker());
    await Promise.all(workers);

    const scored = documents.map((doc, originalIndex) => ({
      doc,
      similarity: this._cosineSimilarity(
        queryEmbedding,
        embeddings[originalIndex],
      ),
      originalIndex,
    }));

    // Sort by similarity descending, then by original index for stability
    scored.sort((a, b) => {
      if (b.similarity !== a.similarity) return b.similarity - a.similarity;
      return a.originalIndex - b.originalIndex;
    });

    const results = scored.slice(0, topK).map(({ doc, similarity }) => {
      const result =
        typeof doc === 'object' ? { ...doc } : { text: String(doc) };
      result.relevanceScore = similarity;
      return result;
    });

    this.emit('reranked', { count: results.length, topK });

    return results;
  }

  /**
   * Compute cosine similarity between two vectors.
   *
   * @param {number[]} a - First vector
   * @param {number[]} b - Second vector
   * @returns {number} Cosine similarity in [-1, 1], or 0 for zero vectors
   */
  _cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length || a.length === 0) {
      return 0;
    }

    let dot = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }

    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);

    // Handle zero vectors
    if (magA === 0 || magB === 0) {
      return 0;
    }

    return dot / (magA * magB);
  }
}

module.exports = { EmbeddingReranker, DEFAULT_CONFIG };
