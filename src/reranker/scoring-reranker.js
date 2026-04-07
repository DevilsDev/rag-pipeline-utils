"use strict";

/**
 * Version: 1.0.0
 * Path: /src/reranker/scoring-reranker.js
 * Description: BM25-based reranker with IDF-weighted scoring
 * Author: Ali Kahwaji
 */

const { EventEmitter } = require("events");
const { tokenize } = require("../evaluate/scoring");

/** @type {{ k1: number, b: number }} */
const DEFAULT_CONFIG = { k1: 1.2, b: 0.75 };

/**
 * Reranks documents using BM25-like scoring with IDF weighting.
 * Implements the reranker contract: rerank(query, documents, options).
 *
 * @extends EventEmitter
 */
class ScoringReranker extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {number} [options.k1=1.2] - Term frequency saturation parameter
   * @param {number} [options.b=0.75] - Length normalisation parameter
   */
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...options };
  }

  /**
   * Rerank documents against a query using BM25 scoring.
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
    const { k1, b } = this.config;

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) {
      return documents.slice(0, topK);
    }

    // Tokenize all documents and compute average document length
    const docData = documents.map((doc) => {
      const text = doc.content || doc.text || String(doc);
      const tokens = tokenize(text);
      return { doc, tokens };
    });

    const avgDocLen =
      docData.reduce((sum, d) => sum + d.tokens.length, 0) / docData.length;

    // Build document-frequency counts for IDF
    const df = {};
    for (const { tokens } of docData) {
      const unique = new Set(tokens);
      for (const token of unique) {
        df[token] = (df[token] || 0) + 1;
      }
    }

    const N = documents.length;

    // Score each document
    const scored = docData.map(({ doc, tokens }, originalIndex) => {
      const docLen = tokens.length;

      // Build term-frequency map for this document
      const tf = {};
      for (const t of tokens) {
        tf[t] = (tf[t] || 0) + 1;
      }

      let score = 0;
      for (const qToken of queryTokens) {
        const termFreq = tf[qToken] || 0;
        if (termFreq === 0) continue;

        // IDF: log((N - df + 0.5) / (df + 0.5) + 1)
        const docFreq = df[qToken] || 0;
        const idf = Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1);

        // BM25 term score
        const numerator = termFreq * (k1 + 1);
        const denominator = termFreq + k1 * (1 - b + b * (docLen / avgDocLen));
        score += idf * (numerator / denominator);
      }

      return { doc, score, originalIndex };
    });

    // Sort by score descending, then by original index for stability
    scored.sort((a, bb) => {
      if (bb.score !== a.score) return bb.score - a.score;
      return a.originalIndex - bb.originalIndex;
    });

    const results = scored.slice(0, topK).map(({ doc, score }) => {
      const result =
        typeof doc === "object" ? { ...doc } : { text: String(doc) };
      result.relevanceScore = score;
      return result;
    });

    this.emit("reranked", { count: results.length, topK });

    return results;
  }
}

module.exports = { ScoringReranker, DEFAULT_CONFIG };
