/**
 * Mock OpenAI LLM Plugin
 * Implements: llm.ask(prompt)
 */
export default class OpenAILLM {
  ask(prompt) {
    return `Answer: Mocked response to "${prompt}"`;
  }
}
