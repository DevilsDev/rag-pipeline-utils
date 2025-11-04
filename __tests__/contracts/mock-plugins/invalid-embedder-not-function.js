/**
 * Invalid Embedder Plugin - embed is not a function
 */

class InvalidEmbedderNotFunction {
  constructor() {
    this.name = "Invalid Embedder Not Function";
    this.version = "1.0.0";
    this.type = "embedder";
    this.embed = "not a function"; // Contract violation - must be function
  }
}

module.exports = InvalidEmbedderNotFunction;
