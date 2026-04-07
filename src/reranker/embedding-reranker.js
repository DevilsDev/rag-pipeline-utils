"use strict";

/**
 * Version: 1.0.0
 * Path: /src/reranker/embedding-reranker.js
 * Description: Cosine similarity reranker using any embedder
 * Author: Ali Kahwaji
 */

const { EventEmitter } = require("events");

/** @type {object} */
const DEFAULT_CONFIG = {};

/**
 * Reranks documents by computing cosine similarity between query and
 * document embeddings produced by an external embedder.
 * Implements the reranker contract: rerank(query, documents, options).
 *
 * @extends EventEmitter
 */
class EmbeddingReranker extends EventEmitter {
  /**
   * @param {object} embedder - Must expose .embedQuery(text) or .embed(text)
   * @param {object} [options]
   */
  constructor(embedder, options = {}) {
    super();
    if (!embedder) {
      throw new Error("EmbeddingReranker requires an embedder instance");
    }
    this.embedder = embedder;
    this.config = { ...DEFAULT_CONFIG, ...options };
  }

  /**
   * Rerank documents by cosine similarity to the query embedding.
   *
   * @param {string} query - The search query
   * @param {Array<object|string>} documents - Documents to rerank
   * @param {object} [options]
   * @param {number} [options.topK] - Maximum number of results to return
   * @returns {Promise<object[]>} Reranked documents with .relevanceScore
   */
  async rerank(query, documents, options = {}) {
    if (!Array.isArray(documents) || documents.length === 0) {
      return [];
    }

    const { topK = documents.length } = options;

    // Get query embedding
    const queryEmbedding = this.embedder.embedQuery
      ? await this.embedder.embedQuery(query)
      : await this.embedder.embed(query);

    // Get document embeddings and compute similarities
    const scored = await Promise.all(
      documents.map(async (doc, originalIndex) => {
        const text = doc.content || doc.text || String(doc);

        const docEmbedding = this.embedder.embedQuery
          ? await this.embedder.embedQuery(text)
          : await this.embedder.embed(text);

        const similarity = this._cosineSimilarity(queryEmbedding, docEmbedding);

        return { doc, similarity, originalIndex };
      }),
    );

    // Sort by similarity descending, then by original index for stability
    scored.sort((a, b) => {
      if (b.similarity !== a.similarity) return b.similarity - a.similarity;
      return a.originalIndex - b.originalIndex;
    });

    const results = scored.slice(0, topK).map(({ doc, similarity }) => {
      const result =
        typeof doc === "object" ? { ...doc } : { text: String(doc) };
      result.relevanceScore = similarity;
      return result;
    });

    this.emit("reranked", { count: results.length, topK });

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
