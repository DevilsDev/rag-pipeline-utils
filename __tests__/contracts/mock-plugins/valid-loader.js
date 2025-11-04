/**
 * Valid Loader Plugin - Fully compliant with loader contract
 */

class ValidLoaderPlugin {
  constructor() {
    this.name = "Valid Loader Plugin";
    this.version = "1.0.0";
    this.type = "loader";
  }

  /**
   * Load documents from source
   * @param {string} source - Source path or identifier
   * @returns {Promise<Array>} Array of documents
   */
  async load(source) {
    return [
      {
        id: "doc-1",
        content: "Sample document content",
        metadata: { source, timestamp: Date.now() },
      },
      {
        id: "doc-2",
        content: "Another document",
        metadata: { source, timestamp: Date.now() },
      },
    ];
  }
}

module.exports = ValidLoaderPlugin;
