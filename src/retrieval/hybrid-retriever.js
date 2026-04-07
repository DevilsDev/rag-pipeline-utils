'use strict';

const { EventEmitter } = require('events');
const { reciprocalRankFusion } = require('./rank-fusion');

const DEFAULT_CONFIG = {
  topK: 10,
  fusionK: 60,
};

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

    const topK = (query && query.topK) || this.config.topK;

    // Run all retrievers in parallel
    const promises = this.retrievers.map(({ retriever, name }) => {
      const fn =
        typeof retriever.retrieve === 'function'
          ? retriever.retrieve.bind(retriever)
          : typeof retriever.search === 'function'
            ? retriever.search.bind(retriever)
            : null;

      if (!fn) {
        return Promise.reject(
          new Error(`Retriever "${name}" has no retrieve() or search() method`),
        );
      }

      // Pass query string or the full query object depending on method
      const arg = typeof query === 'string' ? query : query.query || query;
      return fn(arg);
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

    const fused = reciprocalRankFusion(resultSets, {
      k: this.config.fusionK,
      weights,
    });

    const topResults = fused.slice(0, topK);

    this.emit('retrieved', {
      totalRetrievers: this.retrievers.length,
      successfulRetrievers: successCount,
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
