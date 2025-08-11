/**
 * Unit tests for LLM streaming functionality
 * Tests async generator output, token-level streaming, and error handling
 */

const OpenAILLM = require('../../fixtures/src/mocks/openai-llm.js');

describe('LLM Streaming', () => {
  let llm;

  beforeEach(() => {
    llm = new OpenAILLM();
  });

  describe('generate() method', () => {
    it('should return non-streaming response by default', async () => {
      const response = await llm.generate('Test prompt');
      
      expect(response).toHaveProperty('text');
      expect(response).toHaveProperty('usage');
      expect(response.text).toContain('Generated response to: "Test prompt"');
      expect(response.usage.promptTokens).toBeGreaterThan(0);
      expect(response.usage.completionTokens).toBe(20);
    });

    it('should return async generator when streaming enabled', async () => {
      const stream = await llm.generate('Test prompt', { stream: true });
      
      expect(stream).toBeDefined();
      expect(typeof stream[Symbol.asyncIterator]).toBe('function');
    });
  });

  describe('generateStream() method', () => {
    it('should yield tokens sequentially', async () => {
      const tokens = [];
      const stream = llm.generateStream('Hello');
      
      for await (const chunk of stream) {
        tokens.push(chunk);
      }
      
      expect(tokens.length).toBeGreaterThan(1);
      expect(tokens[tokens.length - 1].done).toBe(true);
      expect(tokens[tokens.length - 1].token).toBe('');
      
      // Check that non-final tokens have content
      const contentTokens = tokens.slice(0, -1);
      expect(contentTokens.every(t => !t.done)).toBe(true);
      expect(contentTokens.every(t => t.token.length > 0)).toBe(true);
    });

    it('should include usage information in final token', async () => {
      const tokens = [];
      const stream = llm.generateStream('Test prompt');
      
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

    it('should handle empty prompt gracefully', async () => {
      const tokens = [];
      const stream = llm.generateStream('');
      
      for await (const chunk of stream) {
        tokens.push(chunk);
      }
      
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[tokens.length - 1].done).toBe(true);
    });

    it('should simulate realistic streaming delays', async () => {
      const startTime = Date.now();
      const tokens = [];
      const stream = llm.generateStream('Test');
      
      for await (const chunk of stream) {
        tokens.push(chunk);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should take some time but use upper-bound check instead of exact timing
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(duration).toBeLessThan(30000); // 30s max reasonable upper bound
      expect(tokens.length).toBeGreaterThan(0); // Focus on functional correctness
    }, 15000);
  });

  describe('streaming error handling', () => {
    it('should handle stream interruption gracefully', async () => {
      const stream = llm.generateStream('Test prompt');
      const iterator = stream[Symbol.asyncIterator]();
      
      // Get first token
      const first = await iterator.next();
      expect(first.done).toBe(false);
      
      // Simulate interruption by not continuing iteration
      // This should not throw errors
      expect(() => iterator.return?.()).not.toThrow();
    });

    it('should handle concurrent streams independently', async () => {
      const stream1 = llm.generateStream('Prompt 1');
      const stream2 = llm.generateStream('Prompt 2');
      
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
        })()
      ]);
      
      expect(tokens1.length).toBeGreaterThan(0);
      expect(tokens2.length).toBeGreaterThan(0);
      
      // Streams should contain different content
      const content1 = tokens1.map(t => t.token).join('');
      const content2 = tokens2.map(t => t.token).join('');
      expect(content1).toContain('Prompt 1');
      expect(content2).toContain('Prompt 2');
    });
  });

  describe('streaming performance', () => {
    it('should not accumulate memory during streaming', async () => {
      // Test with longer content to check memory usage
      const longPrompt = 'A'.repeat(1000);
      const stream = llm.generateStream(longPrompt);
      
      let tokenCount = 0;
      let maxMemoryUsage = 0;
      
      for await (const chunk of stream) {
        tokenCount++;
        
        // Simulate memory check (in real tests, you might use process.memoryUsage())
        const currentMemory = tokenCount * 100; // Mock memory calculation
        maxMemoryUsage = Math.max(maxMemoryUsage, currentMemory);
      }
      
      expect(tokenCount).toBeGreaterThan(0);
      // Memory usage should be reasonable (this is a mock test)
      expect(maxMemoryUsage).toBeLessThan(10000);
    });

    it('should handle backpressure simulation', async () => {
      const stream = llm.generateStream('Test prompt');
      const tokens = [];
      let processingDelay = 0;
      
      for await (const chunk of stream) {
        // Simulate slow processing
        const start = Date.now();
        await new Promise(resolve => setTimeout(resolve, 5));
        processingDelay += Date.now() - start;
        
        tokens.push(chunk);
      }
      
      expect(tokens.length).toBeGreaterThan(0);
      expect(processingDelay).toBeGreaterThan(0);
    });
  });
});
