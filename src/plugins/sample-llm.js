/**
 * Sample LLM Plugin
 * Minimal fixture for test compatibility
 */

class SampleLLM {
  constructor(options = {}) {
    this.name = 'sample-llm';
    this.version = '1.0.0';
    this.options = options;
  }

  async generate(prompt, context = []) {
    // Mock response for testing
    return `Generated response for: ${prompt.substring(0, 50)}...`;
  }

  async *generateStream(prompt, context = []) {
    const response = `Generated response for: ${prompt.substring(0, 50)}...`;
    const tokens = response.split(' ');

    for (const token of tokens) {
      yield token + ' ';
      // Small delay for realistic streaming
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

module.exports = { SampleLLM };
