/**
 * Sample Loader Plugin
 * Minimal fixture for test compatibility
 */

class SampleLoader {
  constructor(options = {}) {
    this.name = 'sample-loader';
    this.version = '1.0.0';
    this.options = options;
  }

  async load(filePath) {
    return [
      {
        content: 'Sample document content',
        metadata: { source: filePath },
        chunk: () => ['Sample chunk 1', 'Sample chunk 2'],
      },
    ];
  }
}

module.exports = { SampleLoader };
