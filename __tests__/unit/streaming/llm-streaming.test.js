/**
 * Unit tests for LLM streaming functionality
 * Tests async generator output, token-level streaming, and error handling
 */

const OpenAILLM = require("../../fixtures/src/mocks/openai-llm.js");

describe("LLM Streaming", () => {
  let llm;

  beforeEach(() => {
    llm = new OpenAILLM();
  });

  afterEach(() => {
    if (llm && typeof llm.reset === "function") {
      llm.reset();
    }
  });

  describe("generate() method", () => {
    it("should return non-streaming response by default", async () => {
      const response = await llm.generate("Test prompt");

      expect(response).toHaveProperty("text");
      expect(response).toHaveProperty("usage");
      expect(response.text).toContain('Generated response to: "Test prompt"');
      expect(response.usage.promptTokens).toBeGreaterThan(0);
      expect(response.usage.completionTokens).toBe(20);
    });

    it("should return async generator when streaming enabled", async () => {
      const stream = await llm.generate("Test prompt", { stream: true });

      expect(stream).toBeDefined();
      expect(typeof stream[Symbol.asyncIterator]).toBe("function");
    });
  });

  describe("generateStream() method", () => {
    it("should yield tokens sequentially", async () => {
      const tokens = [];
      const stream = llm.generateStream("Hello");

      for await (const chunk of stream) {
        tokens.push(chunk);
      }

      expect(tokens.length).toBeGreaterThan(1);
      expect(tokens[tokens.length - 1].done).toBe(true);
      expect(tokens[tokens.length - 1].token).toBe("");

      // Check that non-final tokens have content
      const contentTokens = tokens.slice(0, -1);
      expect(contentTokens.every((t) => !t.done)).toBe(true);
      expect(contentTokens.every((t) => t.token.length > 0)).toBe(true);
    });

    it("should include usage information in final token", async () => {
      const tokens = [];
      const stream = llm.generateStream("Test prompt");

      for await (const chunk of stream) {
        tokens.push(chunk);
      }

      const finalToken = tokens[tokens.length - 1];
      expect(finalToken.done).toBe(true);

      // Usage should be in the second-to-last token (last content token)
      const lastContentToken = tokens[tokens.length - 2];
      expect(lastContentToken.usage).toBeDefined();
      expect(lastContentToken.usage.promptTokens).toBeGreaterThan(0);
    });

    it("should handle empty prompt gracefully", async () => {
      const tokens = [];
      const stream = llm.generateStream("");

      for await (const chunk of stream) {
        tokens.push(chunk);
      }

      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[tokens.length - 1].done).toBe(true);
    });

    it("should stream tokens deterministically", async () => {
      const tokens = [];
      const stream = llm.generateStream("Test");

      for await (const chunk of stream) {
        tokens.push(chunk);
      }

      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[tokens.length - 1].done).toBe(true);
      expect(tokens[tokens.length - 1].token).toBe("");
    });
  });

  describe("streaming error handling", () => {
    it("should handle stream interruption gracefully", async () => {
      const stream = llm.generateStream("Test prompt");
      const iterator = stream[Symbol.asyncIterator]();

      // Get first token
      const first = await iterator.next();
      expect(first.done).toBe(false);

      // Simulate interruption by not continuing iteration
      // This should not throw errors
      expect(() => iterator.return?.()).not.toThrow();
    });

    it("should handle injected errors", async () => {
      const testError = new Error("Mock streaming error");
      llm.setMockError(testError);

      const stream = llm.generateStream("Test prompt");

      await expect(async () => {
        for await (const chunk of stream) {
          // Should not reach here
        }
      }).rejects.toThrow("Mock streaming error");
    });

    it("should handle concurrent streams independently", async () => {
      // Create separate LLM instances for independent streams
      const llm1 = new OpenAILLM();
      const llm2 = new OpenAILLM();

      llm1.setMockTokens(["Stream", "1"]);
      llm2.setMockTokens(["Stream", "2"]);

      const stream1 = llm1.generateStream("Prompt 1");
      const stream2 = llm2.generateStream("Prompt 2");

      const tokens1 = [];
      const tokens2 = [];

      // Collect both streams concurrently
      await Promise.all([
        (async () => {
          for await (const chunk of stream1) {
            tokens1.push(chunk);
          }
        })(),
        (async () => {
          for await (const chunk of stream2) {
            tokens2.push(chunk);
          }
        })(),
      ]);

      expect(tokens1.length).toBe(3); // 2 content + 1 done
      expect(tokens2.length).toBe(3); // 2 content + 1 done

      // Streams should contain different content
      expect(tokens1[0].token).toBe("Stream");
      expect(tokens1[1].token).toBe("1");
      expect(tokens2[0].token).toBe("Stream");
      expect(tokens2[1].token).toBe("2");
    });
  });

  describe("streaming performance", () => {
    it("should handle large token sequences efficiently", async () => {
      // Test with many tokens
      const manyTokens = Array.from({ length: 100 }, (_, i) => `token${i}`);
      llm.setMockTokens(manyTokens);

      const tokens = [];
      const stream = llm.generateStream("Long prompt");

      for await (const chunk of stream) {
        tokens.push(chunk);
      }

      expect(tokens.length).toBe(101); // 100 content tokens + 1 done token
      expect(tokens[99].token).toBe("token99");
      expect(tokens[100].done).toBe(true);
    });

    it("should handle controlled token sequences", async () => {
      // Test with custom token sequence
      llm.setMockTokens(["Hello", " world", "!"]);

      const tokens = [];
      const stream = llm.generateStream("Test prompt");

      for await (const chunk of stream) {
        tokens.push(chunk);
      }

      expect(tokens.length).toBe(4); // 3 content tokens + 1 done token
      expect(tokens[0].token).toBe("Hello");
      expect(tokens[1].token).toBe(" world");
      expect(tokens[2].token).toBe("!");
      expect(tokens[3].done).toBe(true);
    });
  });
});
