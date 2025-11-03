/**
 * Mock Embedder Plugin for CI Contract Testing
 */

class MockEmbedder {
  constructor(options = {}) {
    this.options = options;
    this.metadata = {
      name: 'mock-embedder',
      version: '1.0.0',
      type: 'embedder',
      description: 'Mock embedder for contract compliance testing',
    };
    this.dimensions = options.dimensions || 384;
  }

  /**
   * Generate embeddings for text chunks
   * @param {Array} chunks - Array of text chunks with id and content
   * @param {object} options - Embedding options
   * @returns {Promise<Array>} Array of vectors with id and vector
   */
  async embed(chunks, options = {}) {
    if (!Array.isArray(chunks)) {
      throw new Error('chunks must be an array');
    }

    // Mock implementation - generate random vectors
    return chunks.map((chunk) => ({
      id: chunk.id,
      vector: Array.from({ length: this.dimensions }, () => Math.random()),
    }));
  }
}

module.exports = MockEmbedder;
module.exports.default = module.exports;
