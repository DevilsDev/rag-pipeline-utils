/**
 * Invalid Loader Plugin - Missing metadata
 */

class InvalidLoaderMissingMetadata {
  constructor() {
    // Missing name, version, type - contract violation
  }

  async load(source) {
    return [{ id: "doc-1", content: "content" }];
  }
}

module.exports = InvalidLoaderMissingMetadata;
