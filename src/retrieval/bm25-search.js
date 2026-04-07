'use strict';

const { EventEmitter } = require('events');
const { tokenize } = require('../evaluate/scoring');

const DEFAULT_CONFIG = { k1: 1.2, b: 0.75 };

class BM25Search extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.invertedIndex = new Map(); // token -> [{docIndex, tf}]
    this.documents = [];
    this.avgDocLength = 0;
    this.docCount = 0;
  }

  /**
   * Index documents for BM25 search
   * @param {Array} documents - [{id, content|text, metadata?}]
   */
  index(documents) {
    if (!Array.isArray(documents) || documents.length === 0) {
      return;
    }

    this.documents = documents;
    this.docCount = documents.length;
    this.invertedIndex.clear();

    let totalLength = 0;

    for (let docIndex = 0; docIndex < documents.length; docIndex++) {
      const doc = documents[docIndex];
      const text = doc.content || doc.text || '';
      const tokens = tokenize(text);

      totalLength += tokens.length;

      // Count term frequencies for this document
      const tfMap = new Map();
      for (const token of tokens) {
        tfMap.set(token, (tfMap.get(token) || 0) + 1);
      }

      // Add to inverted index
      for (const [token, tf] of tfMap) {
        if (!this.invertedIndex.has(token)) {
          this.invertedIndex.set(token, []);
        }
        this.invertedIndex.get(token).push({ docIndex, tf });
      }
    }

    this.avgDocLength = this.docCount > 0 ? totalLength / this.docCount : 0;

    this.emit('indexed', {
      docCount: this.docCount,
      uniqueTerms: this.invertedIndex.size,
    });
  }

  /**
   * Search using BM25 scoring
   * @param {string} query
   * @param {object} options - {k: 10}
   * @returns {Array} [{id, score, content, metadata}] sorted by BM25 score
   */
  search(query, options = {}) {
    const { k = 10 } = options;

    if (!query || this.docCount === 0) {
      return [];
    }

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) {
      return [];
    }

    const { k1, b } = this.config;
    const N = this.docCount;

    /** @type {Map<number, number>} docIndex -> score */
    const scores = new Map();

    for (const token of queryTokens) {
      const postings = this.invertedIndex.get(token);
      if (!postings) {
        continue;
      }

      const df = postings.length;
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

      for (const { docIndex, tf } of postings) {
        const doc = this.documents[docIndex];
        const docText = doc.content || doc.text || '';
        const docLen = tokenize(docText).length;

        const numerator = tf * (k1 + 1);
        const denominator =
          tf + k1 * (1 - b + b * (docLen / this.avgDocLength));
        const termScore = idf * (numerator / denominator);

        scores.set(docIndex, (scores.get(docIndex) || 0) + termScore);
      }
    }

    // Build result array and sort
    const results = [];
    for (const [docIndex, score] of scores) {
      const doc = this.documents[docIndex];
      results.push({
        id: doc.id,
        score,
        content: doc.content || doc.text || '',
        metadata: doc.metadata || {},
      });
    }

    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, k);

    this.emit('searched', {
      query,
      resultCount: topResults.length,
      totalMatches: results.length,
    });

    return topResults;
  }

  /**
   * Clear the index
   */
  clear() {
    this.invertedIndex.clear();
    this.documents = [];
    this.avgDocLength = 0;
    this.docCount = 0;
  }

  /**
   * Get index stats
   * @returns {{docCount: number, uniqueTerms: number, avgDocLength: number}}
   */
  getStats() {
    return {
      docCount: this.docCount,
      uniqueTerms: this.invertedIndex.size,
      avgDocLength: this.avgDocLength,
    };
  }
}

module.exports = { BM25Search, DEFAULT_CONFIG };
