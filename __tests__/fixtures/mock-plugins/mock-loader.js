/**
 * Mock Loader Plugin for CI Contract Testing
 */

class MockLoader {
  constructor(options = {}) {
    this.options = options;
    this.metadata = {
      name: 'mock-loader',
      version: '1.0.0',
      type: 'loader',
      description: 'Mock loader for contract compliance testing',
    };
  }

  /**
   * Load documents from source
   * @param {string} source - Source to load from
   * @param {object} options - Loading options
   * @returns {Promise<Array>} Array of documents
   */
  async load(source, options = {}) {
    // Mock implementation
    return [
      {
        id: 'doc-1',
        content: 'Sample document content',
        metadata: {
          source,
          timestamp: Date.now(),
        },
      },
      {
        id: 'doc-2',
        content: 'Another document',
        metadata: {
          source,
          timestamp: Date.now(),
        },
      },
    ];
  }
}

module.exports = MockLoader;
module.exports.default = module.exports;
