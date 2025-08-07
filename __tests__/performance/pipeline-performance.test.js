/**
 * Performance Testing Suite for RAG Pipeline
 * Tests performance with large datasets, concurrent execution, and stress scenarios
 */

// Jest is available globally in CommonJS mode;
const { createRagPipeline  } = require('../../src/core/pipeline-factory.js');
const { PerformanceHelper, TestDataGenerator  } = require('../utils/test-helpers.js');
const OpenAILLM = require('../fixtures/src/mocks/openai-llm.js');
const PineconeRetriever = require('../fixtures/src/mocks/pinecone-retriever.js');
const MockReranker = require('../fixtures/src/mocks/reranker.js');

// Increase timeout for performance tests
jest.setTimeout(30000);

describe('Pipeline Performance Testing', () => {
  let pipeline;
  let mockLLM;
  let mockRetriever;
  let mockReranker;

  beforeEach(() => {
    mockLLM = new OpenAILLM();
    mockRetriever = new PineconeRetriever();
    mockReranker = new MockReranker();

    pipeline = createRagPipeline({
      llm: mockLLM,
      retriever: mockRetriever,
      reranker: mockReranker,
      enableRetry: true,
      enableLogging: false
    });
  });

  describe('large dataset performance', () => {
    it('should handle 10,000 documents efficiently', async () => {
      const largeDataset = TestDataGenerator.generateDocuments(10000);
      const vectors = TestDataGenerator.generateVectors(10000);
      
      const storePerformance = await PerformanceHelper.measureExecutionTime(async () => {
        return await mockRetriever.store(vectors);
      });

      expect(storePerformance.duration).toBeLessThan(5000); // 5 seconds max
      expect(storePerformance.result.stored).toBe(10000);

      // Test retrieval performance
      const queryVector = TestDataGenerator.generateVectors(1)[0].values;
      const retrievalPerformance = await PerformanceHelper.measureExecutionTime(async () => {
        return await mockRetriever.retrieve(queryVector, { topK: 100 });
      });

      expect(retrievalPerformance.duration).toBeLessThan(1000); // 1 second max
      expect(retrievalPerformance.result.length).toBeLessThanOrEqual(100);
    });

    it('should maintain performance with increasing document sizes', async () => {
      const documentSizes = [1000, 5000, 10000, 50000]; // Number of documents
      const results = [];

      for (const size of documentSizes) {
        const documents = TestDataGenerator.generateDocuments(size);
        const vectors = TestDataGenerator.generateVectors(size);
        
        const performance = await PerformanceHelper.measureExecutionTime(async () => {
          await mockRetriever.store(vectors);
          const queryVector = TestDataGenerator.generateVectors(1)[0].values;
          return await mockRetriever.retrieve(queryVector, { topK: 10 });
        });

        results.push({
          documentCount: size,
          duration: performance.duration,
          throughput: size / (performance.duration / 1000) // docs per second
        });
      }

      // Performance should scale reasonably (not exponentially)
      const firstThroughput = results[0].throughput;
      const lastThroughput = results[results.length - 1].throughput;
      
      // Throughput shouldn't degrade more than 50%
      expect(lastThroughput).toBeGreaterThan(firstThroughput * 0.5);
    });

    it('should handle memory efficiently with large embeddings', async () => {
      const memoryTest = PerformanceHelper.monitorMemoryUsage(async () => {
        // Create large embeddings (1536 dimensions x 1000 vectors)
        const largeVectors = TestDataGenerator.generateVectors(1000, 1536);
        
        await mockRetriever.store(largeVectors);
        
        // Perform multiple retrievals
        for (let i = 0; i < 100; i++) {
          const queryVector = TestDataGenerator.generateVectors(1, 1536)[0].values;
          await mockRetriever.retrieve(queryVector, { topK: 20 });
        }
      });

      const result = await memoryTest();
      
      // Memory usage should be reasonable (less than 100MB increase)
      expect(result.memoryDelta.heapUsed).toBeLessThan(100 * 1024 * 1024);
    });
  });

  describe('concurrent execution performance', () => {
    it('should handle concurrent pipeline executions', async () => {
      const concurrencyLevels = [1, 5, 10, 20];
      const results = [];

      // Setup test data
      const documents = TestDataGenerator.generateDocuments(1000);
      const vectors = TestDataGenerator.generateVectors(1000);
      await mockRetriever.store(vectors);

      for (const concurrency of concurrencyLevels) {
        const queries = TestDataGenerator.generateTestQueries();
        const queryPromises = [];

        const startTime = Date.now();
        
        for (let i = 0; i < concurrency; i++) {
          const query = queries[i % queries.length];
          const queryVector = TestDataGenerator.generateVectors(1)[0].values;
          
          queryPromises.push(
            pipeline.run({
              query: query.query,
              queryVector,
              options: { topK: 5 }
            })
          );
        }

        await Promise.all(queryPromises);
        const endTime = Date.now();
        
        results.push({
          concurrency,
          totalDuration: endTime - startTime,
          avgDurationPerQuery: (endTime - startTime) / concurrency
        });
      }

      // Concurrent execution should be more efficient than sequential
      const sequential = results.find(r => r.concurrency === 1);
      const concurrent = results.find(r => r.concurrency === 10);
      
      expect(concurrent.totalDuration).toBeLessThan(sequential.totalDuration * 8);
    });

    it('should handle streaming concurrency efficiently', async () => {
      const streamingBenchmark = PerformanceHelper.createBenchmark('concurrent-streaming', 50);
      
      const result = await streamingBenchmark.run(async () => {
        const streamPromises = [];
        
        for (let i = 0; i < 5; i++) {
          const queryVector = TestDataGenerator.generateVectors(1)[0].values;
          
          streamPromises.push(
            pipeline.run({
              query: `Concurrent query ${i}`,
              queryVector,
              options: { stream: true, topK: 3 }
            }).then(async (stream) => {
              const tokens = [];
              for await (const chunk of stream) {
                tokens.push(chunk);
              }
              return tokens;
            })
          );
        }
        
        return await Promise.all(streamPromises);
      });

      expect(result.mean).toBeLessThan(2000); // 2 seconds average
      expect(result.p95).toBeLessThan(5000); // 95th percentile under 5 seconds
    });

    it('should maintain performance under stress conditions', async () => {
      // Stress test: 100 concurrent requests with large data
      const stressTest = async () => {
        const largeVectors = TestDataGenerator.generateVectors(5000);
        await mockRetriever.store(largeVectors);

        const stressPromises = [];
        
        for (let i = 0; i < 100; i++) {
          const queryVector = TestDataGenerator.generateVectors(1)[0].values;
          
          stressPromises.push(
            pipeline.run({
              query: `Stress test query ${i}`,
              queryVector,
              options: { topK: 50, useReranker: true }
            })
          );
        }

        return await Promise.all(stressPromises);
      };

      const stressPerformance = await PerformanceHelper.measureExecutionTime(stressTest);
      
      expect(stressPerformance.duration).toBeLessThan(30000); // 30 seconds max
      expect(stressPerformance.result.length).toBe(100);
    });
  });

  describe('streaming performance optimization', () => {
    it('should optimize token streaming latency', async () => {
      const streamingLatencyTest = async () => {
        const queryVector = TestDataGenerator.generateVectors(1)[0].values;
        
        const stream = await pipeline.run({
          query: 'Test streaming latency optimization',
          queryVector,
          options: { stream: true }
        });

        const tokenTimings = [];
        let lastTokenTime = Date.now();
        
        for await (const chunk of stream) {
          const currentTime = Date.now();
          tokenTimings.push(currentTime - lastTokenTime);
          lastTokenTime = currentTime;
        }

        return tokenTimings;
      };

      const timings = await streamingLatencyTest();
      
      // Average token latency should be reasonable
      const avgLatency = timings.reduce((a, b) => a + b, 0) / timings.length;
      expect(avgLatency).toBeLessThan(100); // 100ms average between tokens
      
      // No single token should take too long
      const maxLatency = Math.max(...timings);
      expect(maxLatency).toBeLessThan(500); // 500ms max for any token
    });

    it('should handle backpressure gracefully', async () => {
      const backpressureTest = async () => {
        const queryVector = TestDataGenerator.generateVectors(1)[0].values;
        
        const stream = await pipeline.run({
          query: 'Test backpressure handling',
          queryVector,
          options: { stream: true }
        });

        const tokens = [];
        let processingDelay = 0;
        
        for await (const chunk of stream) {
          const start = Date.now();
          
          // Simulate slow processing (backpressure)
          await new Promise(resolve => setTimeout(resolve, 50));
          
          processingDelay += Date.now() - start;
          tokens.push(chunk);
        }

        return { tokens, processingDelay };
      };

      const result = await backpressureTest();
      
      expect(result.tokens.length).toBeGreaterThan(0);
      expect(result.processingDelay).toBeGreaterThan(result.tokens.length * 40);
    });
  });

  describe('memory and resource optimization', () => {
    it('should prevent memory leaks during long operations', async () => {
      const memoryLeakTest = PerformanceHelper.monitorMemoryUsage(async () => {
        // Simulate long-running operation
        for (let i = 0; i < 100; i++) {
          const documents = TestDataGenerator.generateDocuments(100);
          const vectors = TestDataGenerator.generateVectors(100);
          
          await mockRetriever.store(vectors);
          
          const queryVector = TestDataGenerator.generateVectors(1)[0].values;
          await mockRetriever.retrieve(queryVector, { topK: 10 });
          
          // Force garbage collection simulation
          if (global.gc) {
            global.gc();
          }
        }
      });

      const result = await memoryLeakTest();
      
      // Memory growth should be minimal for repeated operations
      expect(result.memoryDelta.heapUsed).toBeLessThan(50 * 1024 * 1024); // 50MB max
    });

    it('should optimize CPU usage during intensive operations', async () => {
      const cpuIntensiveTest = async () => {
        const startCpuUsage = process.cpuUsage();
        
        // CPU-intensive operations
        const largeDataset = TestDataGenerator.generateDocuments(1000);
        const queries = TestDataGenerator.generateTestQueries();
        
        for (const testQuery of queries) {
          const queryVector = TestDataGenerator.generateVectors(1)[0].values;
          
          // Rerank large dataset
          await mockReranker.rerank(testQuery.query, largeDataset, { topK: 100 });
        }
        
        const endCpuUsage = process.cpuUsage(startCpuUsage);
        return endCpuUsage;
      };

      const cpuUsage = await cpuIntensiveTest();
      
      // CPU usage should be reasonable (not blocking event loop)
      expect(cpuUsage.user + cpuUsage.system).toBeLessThan(10000000); // 10 seconds CPU time
    });
  });

  describe('performance regression detection', () => {
    it('should establish performance baselines', async () => {
      const baselineTests = [
        {
          name: 'simple-query',
          test: async () => {
            const queryVector = TestDataGenerator.generateVectors(1)[0].values;
            return await pipeline.run({
              query: 'Simple baseline query',
              queryVector,
              options: { topK: 5 }
            });
          }
        },
        {
          name: 'streaming-query',
          test: async () => {
            const queryVector = TestDataGenerator.generateVectors(1)[0].values;
            const stream = await pipeline.run({
              query: 'Streaming baseline query',
              queryVector,
              options: { stream: true, topK: 5 }
            });
            
            const tokens = [];
            for await (const chunk of stream) {
              tokens.push(chunk);
            }
            return tokens;
          }
        },
        {
          name: 'reranking-query',
          test: async () => {
            const documents = TestDataGenerator.generateDocuments(50);
            const vectors = TestDataGenerator.generateVectors(50);
            await mockRetriever.store(vectors);
            
            const queryVector = TestDataGenerator.generateVectors(1)[0].values;
            return await pipeline.run({
              query: 'Reranking baseline query',
              queryVector,
              options: { topK: 10, useReranker: true }
            });
          }
        }
      ];

      const baselines = {};
      
      for (const baselineTest of baselineTests) {
        const performance = await PerformanceHelper.measureExecutionTime(baselineTest.test);
        baselines[baselineTest.name] = {
          duration: performance.duration,
          timestamp: performance.timestamp
        };
      }

      // Store baselines for future regression testing
      expect(baselines['simple-query'].duration).toBeLessThan(1000);
      expect(baselines['streaming-query'].duration).toBeLessThan(2000);
      expect(baselines['reranking-query'].duration).toBeLessThan(3000);
      
      // Baselines should be consistent across runs
      expect(Object.keys(baselines)).toHaveLength(3);
    });
  });
});
