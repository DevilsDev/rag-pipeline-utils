/**
 * Version: 1.0.0
 * Description: Mock implementation of OpenAI LLM for testing fallback CLI config.
 * Author: Ali Kahwaji
 * File: __tests__/fixtures/src/mocks/openai-llm.js
 */

export default class OpenAILLM {
  async generate(prompt) {
    console.log(`[MOCK LLM] Generating response for prompt: ${prompt}`);
    return '[0, 1, 2]'; // Mocked ranked indices
  }
}
