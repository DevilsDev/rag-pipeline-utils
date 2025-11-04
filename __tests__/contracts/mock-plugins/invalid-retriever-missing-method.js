/**
 * Invalid Retriever Plugin - Missing retrieve method
 */

class InvalidRetrieverMissingMethod {
  constructor() {
    this.name = "Invalid Retriever Missing Method";
    this.version = "1.0.0";
    this.type = "retriever";
  }

  async store(vectors) {
    return { success: true };
  }

  // Missing retrieve method - contract violation
}

module.exports = InvalidRetrieverMissingMethod;
