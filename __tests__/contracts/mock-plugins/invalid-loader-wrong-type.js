/**
 * Invalid Loader Plugin - Wrong type
 */

class InvalidLoaderWrongType {
  constructor() {
    this.name = "Invalid Loader Wrong Type";
    this.version = "1.0.0";
    this.type = "embedder"; // Wrong type - should be 'loader'
  }

  async load(source) {
    return [{ id: "doc-1", content: "content" }];
  }
}

module.exports = InvalidLoaderWrongType;
