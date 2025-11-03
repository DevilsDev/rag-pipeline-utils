/**
 * Mock Retriever Plugin for CI Contract Testing
 */

class MockRetriever {
  constructor(options = {}) {
    this.options = options;
    this.metadata = {
      name: 'mock-retriever',
      version: '1.0.0',
      type: 'retriever',
      description: 'Mock retriever for contract compliance testing',
    };
  }

  /**
   * Store vectors in the retrieval system
   * @param {Array} vectors - Array of vectors to store with id, vector, and metadata
   * @returns {Promise<boolean>} Success status
   */
  async store(vectors) {
    if (!Array.isArray(vectors)) {
      throw new Error('vectors must be an array');
    }

    // Mock implementation - just return success
    return true;
  }

  /**
   * Retrieve relevant documents for a query
   * @param {string} query - Search query
   * @param {number} k - Number of results to retrieve
   * @returns {Promise<Array>} Array of retrieved documents with scores
   */
  async retrieve(query, k) {
    if (!query || typeof query !== 'string') {
      throw new Error('query must be a non-empty string');
    }

    const topK = k || 5;

    // Mock implementation - return sample documents
    return Array.from({ length: Math.min(topK, 3) }, (_, i) => ({
      id: `result-${i + 1}`,
      content: `Mock result ${i + 1} for query: ${query}`,
      score: 1.0 - i * 0.2,
      metadata: {
        source: 'mock-index',
        timestamp: Date.now(),
      },
    }));
  }
}

module.exports = MockRetriever;
module.exports.default = module.exports;
