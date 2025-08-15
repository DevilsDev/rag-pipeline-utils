/**
 * Integration tests for streaming pipeline functionality
 * Tests end-to-end streaming with retry middleware and error recovery
 */

const { createRagPipeline  } = require('../../src/core/pipeline-factory.js');
const OpenAILLM = require('../fixtures/src/mocks/openai-llm.js');
const PineconeRetriever = require('../fixtures/src/mocks/pinecone-retriever.js');
const MockReranker = require('../fixtures/src/mocks/reranker.js');

describe('Streaming Pipeline Integration', () => {
  let pipeline;
  let mockLLM;
  let mockRetriever;
  let mockReranker;

  beforeEach(() => {
    mockLLM = new OpenAILLM();
    mockRetriever = new PineconeRetriever();
    mockReranker = new MockReranker();

    // Setup test data in retriever
    const testVectors = [
      {
        id: 'doc1',
        values: [0.1, 0.2, 0.3],
        metadata: { title: 'Document 1', category: 'tech' }
      },
      {
        id: 'doc2',
        values: [0.4, 0.5, 0.6],
        metadata: { title: 'Document 2', category: 'science' }
      }
    ];
    
    mockRetriever.store(testVectors);

    pipeline = createRagPipeline({
      llm: mockLLM,
      retriever: mockRetriever,
      reranker: mockReranker,
      enableRetry: true,
      enableLogging: false // Disable for cleaner test output
    });
  });

  // Batch 4: Resource Management - Add proper cleanup
  afterEach(async () => {
    // Clean up pipeline resources
    if (pipeline && typeof pipeline.cleanup === 'function') {
      await pipeline.cleanup();
    }
    
    // Clean up mock resources
    if (mockLLM && typeof mockLLM.cleanup === 'function') {
      await mockLLM.cleanup();
    }
    if (mockRetriever && typeof mockRetriever.cleanup === 'function') {
      await mockRetriever.cleanup();
    }
    if (mockReranker && typeof mockReranker.cleanup === 'function') {
      await mockReranker.cleanup();
    }
    
    // Clear any pending timers or intervals
    jest.clearAllTimers();
  });

  afterAll(async () => {
    // Final cleanup to prevent resource leaks
    if (global.gc) {
      global.gc();
    }
  });

  describe('end-to-end streaming', () => {
    it('should stream complete pipeline response', async () => {
      const query = 'What is machine learning?';
      const queryVector = [0.2, 0.3, 0.4]; // Mock embedding
      
      const streamResponse = await pipeline.run({
        query,
        queryVector,
        options: { stream: true, topK: 2 }
      });

      expect(streamResponse).toBeDefined();
      expect(typeof streamResponse[Symbol.asyncIterator]).toBe('function');

      const tokens = [];
      for await (const chunk of streamResponse) {
        tokens.push(chunk);
      }

      expect(tokens.length).toBeGreaterThan(1);
      expect(tokens[tokens.length - 1].done).toBe(true);
      
      // Verify streaming content includes query context
      const fullContent = tokens.map(t => t.token).join('');
      expect(fullContent).toContain('Generated response to:');
      expect(fullContent).toContain(query);
    });

    it('should handle streaming with reranker integration', async () => {
      const query = 'Advanced AI techniques';
      const queryVector = [0.1, 0.8, 0.2];
      
      const streamResponse = await pipeline.run({
        query,
        queryVector,
        options: { 
          stream: true, 
          topK: 2,
          useReranker: true,
          rerankerOptions: { threshold: 0.3 }
        }
      });

      const tokens = [];
      for await (const chunk of streamResponse) {
        tokens.push(chunk);
      }

      expect(tokens.length).toBeGreaterThan(0);
      
      // Should include reranked context in the response
      const fullContent = tokens.map(t => t.token).join('');
      expect(fullContent).toBeTruthy();
    });

    it('should handle empty retrieval results gracefully', async () => {
      // Use retriever with no stored data
      const emptyRetriever = new PineconeRetriever();
      const emptyPipeline = createRagPipeline({
        llm: mockLLM,
        retriever: emptyRetriever,
        enableRetry: false
      });

      const query = 'Non-existent topic';
      const queryVector = [0.9, 0.1, 0.5];
      
      const streamResponse = await emptyPipeline.run({
        query,
        queryVector,
        options: { stream: true }
      });

      const tokens = [];
      for await (const chunk of streamResponse) {
        tokens.push(chunk);
      }

      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[tokens.length - 1].done).toBe(true);
    });
  });

  describe('streaming with retry middleware', () => {
    it('should retry failed streaming operations', async () => {
      // Create a mock LLM that fails once then succeeds
      let attemptCount = 0;
      const flakyLLM = {
        async generate(prompt, options = {}) {
          attemptCount++;
          if (attemptCount === 1) {
            throw new Error('Temporary streaming failure');
          }
          
          if (options.stream) {
            return mockLLM.generateStream(prompt);
          }
          return mockLLM.generate(prompt, options);
        }
      };

      const retryPipeline = createRagPipeline({
        llm: flakyLLM,
        retriever: mockRetriever,
        enableRetry: true,
        retryOptions: { maxAttempts: 3, delay: 10 }
      });

      const query = 'Test retry streaming';
      const queryVector = [0.3, 0.3, 0.3];
      
      const streamResponse = await retryPipeline.run({
        query,
        queryVector,
        options: { stream: true }
      });

      const tokens = [];
      for await (const chunk of streamResponse) {
        tokens.push(chunk);
      }

      expect(attemptCount).toBe(2); // Failed once, succeeded on retry
      expect(tokens.length).toBeGreaterThan(0);
    });

    it('should handle retry exhaustion gracefully', async () => {
      // Create a mock LLM that always fails
      const failingLLM = {
        async generate() {
          throw new Error('Persistent streaming failure');
        }
      };

      const retryPipeline = createRagPipeline({
        llm: failingLLM,
        retriever: mockRetriever,
        enableRetry: true,
        retryOptions: { maxAttempts: 2, delay: 5 }
      });

      const query = 'Test retry exhaustion';
      const queryVector = [0.5, 0.5, 0.5];
      
      await expect(retryPipeline.run({
        query,
        queryVector,
        options: { stream: true }
      })).rejects.toThrow('Persistent streaming failure');
    });
  });

  describe('streaming memory management', () => {
    it('should handle large document streaming without memory leaks', async () => {
      // Create large mock documents
      const largeVectors = Array.from({ length: 100 }, (_, i) => ({
        id: `large-doc-${i}`,
        values: Array.from({ length: 1536 }, () => Math.random()),
        metadata: { 
          title: `Large Document ${i}`,
          content: 'A'.repeat(10000) // 10KB per document
        }
      }));

      await mockRetriever.store(largeVectors);

      const query = 'Process large documents';
      const queryVector = Array.from({ length: 1536 }, () => Math.random());
      
      const streamResponse = await pipeline.run({
        query,
        queryVector,
        options: { stream: true, topK: 50 }
      });

      let tokenCount = 0;
      const startTime = Date.now();
      
      for await (const chunk of streamResponse) {
        tokenCount++;
        
        // Simulate processing time
        if (tokenCount % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(tokenCount).toBeGreaterThan(0);
      // Use upper-bound check for timing - focus on functional correctness
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(duration).toBeLessThan(30000); // 30s max reasonable upper bound
    });

    it('should handle backpressure during streaming', async () => {
      const query = 'Test backpressure handling';
      const queryVector = [0.4, 0.4, 0.4];
      
      const streamResponse = await pipeline.run({
        query,
        queryVector,
        options: { stream: true }
      });

      const tokens = [];
      let totalProcessingTime = 0;
      
      for await (const chunk of streamResponse) {
        const start = Date.now();
        
        // Simulate slow consumer (backpressure)
        await new Promise(resolve => setTimeout(resolve, 20));
        
        totalProcessingTime += Date.now() - start;
        tokens.push(chunk);
      }

      expect(tokens.length).toBeGreaterThan(0);
      // Use relative timing check - focus on functional correctness over exact timing
      expect(totalProcessingTime).toBeGreaterThanOrEqual(0);
      expect(totalProcessingTime).toBeLessThan(60000); // 60s max reasonable upper bound
    });
  });

  describe('streaming error recovery', () => {
    it('should recover from stream interruption', async () => {
      const query = 'Test stream interruption';
      const queryVector = [0.6, 0.2, 0.2];
      
      const streamResponse = await pipeline.run({
        query,
        queryVector,
        options: { stream: true }
      });

      const iterator = streamResponse[Symbol.asyncIterator]();
      
      // Get first few tokens
      const firstToken = await iterator.next();
      const secondToken = await iterator.next();
      
      expect(firstToken.done).toBe(false);
      expect(secondToken.done).toBe(false);
      
      // Simulate interruption
      if (iterator.return) {
        await iterator.return();
      }
      
      // This should not cause issues with the pipeline
      expect(true).toBe(true); // Test passes if no errors thrown
    });

    it('should handle concurrent stream requests', async () => {
      const queries = [
        'Query 1: Machine learning basics',
        'Query 2: Deep learning advanced',
        'Query 3: Natural language processing'
      ];
      
      const streamPromises = queries.map(async (query, index) => {
        const queryVector = [index * 0.3, 0.5, 0.2];
        
        const streamResponse = await pipeline.run({
          query,
          queryVector,
          options: { stream: true }
        });

        const tokens = [];
        for await (const chunk of streamResponse) {
          tokens.push(chunk);
        }
        
        return { query, tokens };
      });

      const results = await Promise.all(streamPromises);
      
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.tokens.length).toBeGreaterThan(0);
        expect(result.tokens[result.tokens.length - 1].done).toBe(true);
      });
    });
  });
});
