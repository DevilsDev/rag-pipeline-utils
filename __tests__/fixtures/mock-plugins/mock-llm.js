/**
 * Mock LLM Plugin for CI Contract Testing
 */

class MockLLM {
  constructor(options = {}) {
    this.options = options;
    this.metadata = {
      name: 'mock-llm',
      version: '1.0.0',
      type: 'llm',
      description: 'Mock LLM for contract compliance testing',
    };
  }

  /**
   * Generate response from prompt
   * @param {string} prompt - Input prompt
   * @param {object} options - Generation options (temperature, maxTokens, etc.)
   * @returns {Promise<string>} Generated response
   */
  async generate(prompt, options = {}) {
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('prompt must be a non-empty string');
    }

    // Mock implementation - return formatted response
    return `Mock LLM response to: "${prompt.substring(0, 50)}..."`;
  }
}

module.exports = MockLLM;
module.exports.default = module.exports;
