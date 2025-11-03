/**
 * Mock Reranker Plugin for CI Contract Testing
 */

class MockReranker {
  constructor(options = {}) {
    this.options = options;
    this.metadata = {
      name: 'mock-reranker',
      version: '1.0.0',
      type: 'reranker',
      description: 'Mock reranker for contract compliance testing',
    };
  }

  /**
   * Rerank search results based on relevance to query
   * @param {Array} results - Array of search results with id, content, and score
   * @param {string} query - Original search query
   * @param {object} options - Reranking options (topK, threshold, etc.)
   * @returns {Promise<Array>} Array of reranked results with relevance scores
   */
  async rerank(results, query, options) {
    if (!Array.isArray(results)) {
      throw new Error('results must be an array');
    }

    if (!query || typeof query !== 'string') {
      throw new Error('query must be a non-empty string');
    }

    // Handle optional options parameter
    const opts = options || {};
    const topK = opts.topK || results.length;
    const threshold = opts.threshold || 0;

    // Mock implementation - add relevance scores and reorder
    const reranked = results
      .map((result, index) => ({
        ...result,
        relevanceScore: 1.0 - index * 0.15, // Mock relevance calculation
      }))
      .filter((result) => result.relevanceScore >= threshold)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, topK);

    return reranked;
  }
}

module.exports = MockReranker;
module.exports.default = module.exports;
