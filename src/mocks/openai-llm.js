/**
 * Version: 2.0.0
 * File: /src/mocks/openai-llm.js
 * Description: Mock implementation of an OpenAI LLM with streaming support
 * Author: Ali Kahwaji
 */

export default class OpenAILLM {
  constructor(options = {}) {
    this.streamDelay = options.streamDelay || 50; // ms between tokens
    this.model = options.model || 'gpt-3.5-turbo';
  }

  /**
   * Generates a complete response from input prompt and context
   * @param {string} prompt
   * @param {Array<{ text: string }>} context
   * @returns {Promise<string>}
   */
  async generate(prompt, context) {
    const contextText = Array.isArray(context) ? context.map(d => d.text || d).join(', ') : '';
    return `Generated answer using context: ${contextText}. Query: "${prompt}". This is a comprehensive response that addresses the user's question based on the retrieved information.`;
  }

  /**
   * Generates a streaming response token-by-token
   * @param {string} prompt
   * @param {Array<{ text: string }>} context
   * @returns {AsyncIterable<string>} Stream of tokens
   */
  async* generateStream(prompt, context) {
    const fullResponse = await this.generate(prompt, context);
    const tokens = this.#tokenize(fullResponse);
    
    for (const token of tokens) {
      // Simulate network delay between tokens
      await this.#delay(this.streamDelay);
      yield token;
    }
  }

  /**
   * Simple tokenization for mock streaming
   * @private
   * @param {string} text - Text to tokenize
   * @returns {string[]} Array of tokens
   */
  #tokenize(text) {
    // Simple word-based tokenization for demo purposes
    // In real implementation, this would use proper tokenization
    return text.split(/\s+/).map(word => word + ' ');
  }

  /**
   * Utility delay function for simulating streaming
   * @private
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  #delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if this LLM instance supports streaming
   * @returns {boolean}
   */
  supportsStreaming() {
    return true;
  }
}