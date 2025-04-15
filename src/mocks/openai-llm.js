/**
 * Version: 0.1.0
 * File: /src/mocks/openai-llm.js
 * Description: Mock implementation of an OpenAI LLM
 * Author: Ali Kahwaji
 */

export default class OpenAILLM {
    /**
     * Generates a static answer from input prompt and context
     * @param {string} prompt
     * @param {Array<{ text: string }>} context
     * @returns {Promise<string>}
     */
    async generate(prompt, context) {
      return `Generated answer using: ${context.map(d => d.text).join(', ')}`;
    }
  }