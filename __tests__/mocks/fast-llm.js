/**
 * Fast Mock LLM for Testing
 * Provides instant responses without delays to speed up tests
 */

class FastMockLLM {
  constructor(options = {}) {
    this.name = "fast-mock-llm";
    this.version = "1.0.0";
    this.options = options;
    this.mockTokens = options.mockTokens || ["Fast", " mock", " response"];
    this.shouldFail = options.shouldFail || false;
  }

  setMockTokens(tokens) {
    this.mockTokens = tokens;
  }

  setMockError(error) {
    this.mockError = error;
  }

  async generate(prompt, context = []) {
    if (this.mockError) {
      throw this.mockError;
    }

    if (this.shouldFail) {
      throw new Error("Mock LLM failure");
    }

    // Instant response for testing
    return this.mockTokens.join("");
  }

  async *generateStream(prompt, context = []) {
    if (this.mockError) {
      throw this.mockError;
    }

    if (this.shouldFail) {
      throw new Error("Mock LLM streaming failure");
    }

    // Yield tokens instantly without delays
    for (const token of this.mockTokens) {
      yield token;
    }
  }
}

module.exports = { FastMockLLM };
