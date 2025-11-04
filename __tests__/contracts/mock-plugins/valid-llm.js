/**
 * Valid LLM Plugin - Fully compliant with LLM contract
 */

class ValidLLMPlugin {
  constructor() {
    this.name = "Valid LLM Plugin";
    this.version = "1.0.0";
    this.type = "llm";
  }

  /**
   * Generate text response
   * @param {string} prompt - Input prompt
   * @param {Array} context - Optional context array
   * @param {Object} options - Additional options
   * @returns {Promise<string>} Generated text
   */
  async generate(prompt, context, options) {
    // Mock generation
    const contextStr = context ? ` with ${context.length} context items` : "";
    return `Generated response to: "${prompt}"${contextStr}`;
  }
}

module.exports = ValidLLMPlugin;
