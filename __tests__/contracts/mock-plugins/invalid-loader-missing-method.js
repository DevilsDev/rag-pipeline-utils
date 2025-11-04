/**
 * Invalid Loader Plugin - Missing required load method
 */

class InvalidLoaderMissingMethod {
  constructor() {
    this.name = "Invalid Loader Missing Method";
    this.version = "1.0.0";
    this.type = "loader";
  }

  // Missing load method - contract violation
}

module.exports = InvalidLoaderMissingMethod;
