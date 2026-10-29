'use strict';

const { EventEmitter } = require('events');
const { reciprocalRankFusion } = require('./rank-fusion');

const DEFAULT_CONFIG = {
  topK: 10,
  fusionK: 60,
};

/**
 * Runs several retrievers in parallel (for example vector and BM25) and
 * fuses their results with weighted reciprocal rank fusion.
 */
class HybridRetriever extends EventEmitter {
  /**
   * @param {Array<{retriever: object, weight: number, name: string}>} retrievers
   * @param {object} options
   */
  constructor(retrievers = [], options = {}) {
    super();
    this.retrievers = retrievers.map((r, i) => ({
      retriever: r.retriever,
      weight: r.weight != null ? r.weight : 1.0,
      name: r.name || `retriever-${i}`,
    }));
    this.config = { ...DEFAULT_CONFIG, ...options };
  }

  /**
   * Run all retrievers in parallel, fuse results
   * @param {object} query - {query: string, queryVector?: number[], topK?: number}
   * @returns {Promise<Array>} Fused results
   */
  async retrieve(query) {
    if (this.retrievers.length === 0) {
      return [];
    }

    const request = typeof query === 'string' ? { query } : { ...query };
    const topK = request.topK || this.config.topK;
    request.topK = topK;

    // Run all retrievers in parallel. retrieve() follows the retriever
    // contract and gets the full request (so vector retrievers receive
    // queryVector); search() is the BM25-style (text, { k }) signature.
    const promises = this.retrievers.map(async ({ retriever, name }) => {
      if (typeof retriever.retrieve === 'function') {
        return retriever.retrieve(request);
      }
      if (typeof retriever.search === 'function') {
        return retriever.search(request.query, { k: topK });
      }
      throw new Error(
        `Retriever "${name}" has no retrieve() or search() method`,
      );
    });

    const settled = await Promise.allSettled(promises);

    const resultSets = [];
    const weights = [];
    let successCount = 0;

    for (let i = 0; i < settled.length; i++) {
      const outcome = settled[i];
      if (outcome.status === 'fulfilled') {
        const results = Array.isArray(outcome.value) ? outcome.value : [];
        resultSets.push(results);
        weights.push(this.retrievers[i].weight);
        successCount++;
      } else {
        // Graceful degradation: log warning and continue
        this.emit('retrieverError', {
          name: this.retrievers[i].name,
          error: outcome.reason,
        });
      }
    }

    if (successCount === 0) {
      const reasons = settled.map((o) => o.reason?.message).join('; ');
      throw new Error(`HybridRetriever: all retrievers failed (${reasons})`);
    }

    const fused = reciprocalRankFusion(resultSets, {
      k: this.config.fusionK,
      weights,
    });

    const topResults = fused.slice(0, topK);

    this.emit('retrieved', {
      totalRetrievers: this.retrievers.length,
      successfulRetrievers: successCount,
      failedRetrievers: this.retrievers.length - successCount,
      resultCount: topResults.length,
    });

    return topResults;
  }

  /**
   * Add a retriever
   * @param {object} retriever - Object with .retrieve() or .search() method
   * @param {number} weight - Weight for rank fusion
   * @param {string} name - Name for this retriever
   */
  addRetriever(retriever, weight = 1.0, name = '') {
    this.retrievers.push({
      retriever,
      weight,
      name: name || `retriever-${this.retrievers.length}`,
    });
  }
}

module.exports = { HybridRetriever, DEFAULT_CONFIG };
