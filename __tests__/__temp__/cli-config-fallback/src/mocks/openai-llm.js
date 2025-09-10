/**
 * Mock OpenAI LLM Plugin - Google-style deterministic implementation
 * Implements: llm.generate(prompt, options)
 */
class OpenAILLM {
  constructor(options = {}) {
    this.mockTokens = options.mockTokens || null;
    this.mockError = options.mockError || null;
  }

  async generate(prompt, options = {}) {
    if (options.stream) {
      return this.generateStream(prompt, options);
    }

    // Synchronous generation - no timers
    return {
      text: `Generated response to: "${prompt}"`,
      usage: {
        promptTokens: Math.ceil(prompt.length / 4),
        completionTokens: 20,
        totalTokens: Math.ceil(prompt.length / 4) + 20,
      },
      model: "gpt-3.5-turbo-mock",
    };
  }

  async *generateStream(prompt, options = {}) {
    // Use injected tokens for testing, or default tokens
    const tokens = this.mockTokens || [
      "Generated",
      " response",
      " to:",
      ` "${prompt}"`,
    ];

    // Handle error injection for testing
    if (this.mockError) {
      throw this.mockError;
    }

    // Deterministic, synchronous streaming - no timers
    for (let i = 0; i < tokens.length; i++) {
      yield {
        token: tokens[i],
        done: false,
        usage:
          i === tokens.length - 1
            ? {
                promptTokens: Math.ceil(prompt.length / 4),
                completionTokens: i + 1,
                totalTokens: Math.ceil(prompt.length / 4) + i + 1,
              }
            : null,
      };
    }

    // Final completion marker
    yield { token: "", done: true };
  }

  // Test utilities for controlling mock behavior
  setMockTokens(tokens) {
    this.mockTokens = tokens;
  }

  setMockError(error) {
    this.mockError = error;
  }

  reset() {
    this.mockTokens = null;
    this.mockError = null;
  }
}

module.exports = OpenAILLM;
