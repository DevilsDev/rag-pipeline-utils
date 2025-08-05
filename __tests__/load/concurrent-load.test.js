/**
 * Load Testing Suite for RAG Pipeline
 * Tests system behavior under high load, concurrent users, and stress conditions
 */

import { jest } from '@jest/globals';
import { createRagPipeline } from '../../src/core/pipeline-factory.js';
import { PerformanceHelper, TestDataGenerator, ErrorSimulator } from '../utils/test-helpers.js';
import OpenAILLM from '../fixtures/src/mocks/openai-llm.js';
import PineconeRetriever from '../fixtures/src/mocks/pinecone-retriever.js';
import MockReranker from '../fixtures/src/mocks/reranker.js';

// Extended timeout for load tests
jest.setTimeout(60000);

describe('Load Testing Suite', () => {
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

  describe('concurrent user simulation', () => {
    it('should handle 100 concurrent users', async () => {
      const userCount = 100;
      const queriesPerUser = 5;
      
      // Setup large dataset
      const documents = TestDataGenerator.generateDocuments(10000);
      const vectors = TestDataGenerator.generateVectors(10000);
      await mockRetriever.store(vectors);

      const userSimulations = [];
      
      for (let userId = 0; userId < userCount; userId++) {
        const userSimulation = async () => {
          const userQueries = [];
          
          for (let queryIndex = 0; queryIndex < queriesPerUser; queryIndex++) {
            const query = `User ${userId} query ${queryIndex}: What is machine learning?`;
            const queryVector = TestDataGenerator.generateVectors(1)[0].values;
            
            userQueries.push(
              pipeline.run({
                query,
                queryVector,
                options: { topK: 10 }
              })
            );
          }
          
          return await Promise.all(userQueries);
        };
        
        userSimulations.push(userSimulation());
      }

      const startTime = Date.now();
      const results = await Promise.all(userSimulations);
      const endTime = Date.now();
      
      const totalQueries = userCount * queriesPerUser;
      const duration = endTime - startTime;
      const queriesPerSecond = totalQueries / (duration / 1000);

      expect(results).toHaveLength(userCount);
      expect(queriesPerSecond).toBeGreaterThan(10); // At least 10 QPS
      expect(duration).toBeLessThan(30000); // Complete within 30 seconds
    });

    it('should maintain response quality under load', async () => {
      const concurrentRequests = 50;
      const testQueries = TestDataGenerator.generateTestQueries();
      
      // Setup test data
      const documents = TestDataGenerator.generateDocuments(1000);
      const vectors = TestDataGenerator.generateVectors(1000);
      await mockRetriever.store(vectors);

      const loadTestPromises = [];
      
      for (let i = 0; i < concurrentRequests; i++) {
        const query = testQueries[i % testQueries.length];
        const queryVector = TestDataGenerator.generateVectors(1)[0].values;
        
        loadTestPromises.push(
          pipeline.run({
            query: query.query,
            queryVector,
            options: { topK: 5, useReranker: true }
          })
        );
      }

      const results = await Promise.all(loadTestPromises);
      
      // Verify all requests completed successfully
      expect(results).toHaveLength(concurrentRequests);
      
      // Check response quality consistency
      results.forEach(result => {
        expect(result).toBeDefined();
        // Add specific quality checks based on your pipeline output format
      });
    });

    it('should handle mixed workload patterns', async () => {
      const workloadPatterns = [
        { type: 'simple', weight: 0.6, options: { topK: 5 } },
        { type: 'streaming', weight: 0.2, options: { stream: true, topK: 3 } },
        { type: 'complex', weight: 0.2, options: { topK: 20, useReranker: true } }
      ];

      const totalRequests = 100;
      const requests = [];
      
      // Generate mixed workload
      for (let i = 0; i < totalRequests; i++) {
        const random = Math.random();
        let cumulativeWeight = 0;
        let selectedPattern = workloadPatterns[0];
        
        for (const pattern of workloadPatterns) {
          cumulativeWeight += pattern.weight;
          if (random <= cumulativeWeight) {
            selectedPattern = pattern;
            break;
          }
        }
        
        requests.push({
          id: i,
          type: selectedPattern.type,
          options: selectedPattern.options
        });
      }

      // Execute mixed workload
      const executionPromises = requests.map(async (request) => {
        const queryVector = TestDataGenerator.generateVectors(1)[0].values;
        const query = `${request.type} query ${request.id}`;
        
        if (request.type === 'streaming') {
          const stream = await pipeline.run({
            query,
            queryVector,
            options: request.options
          });
          
          const tokens = [];
          for await (const chunk of stream) {
            tokens.push(chunk);
          }
          return { requestId: request.id, type: request.type, tokens };
        } else {
          const result = await pipeline.run({
            query,
            queryVector,
            options: request.options
          });
          return { requestId: request.id, type: request.type, result };
        }
      });

      const results = await Promise.all(executionPromises);
      
      expect(results).toHaveLength(totalRequests);
      
      // Verify distribution matches expected patterns
      const typeDistribution = results.reduce((acc, result) => {
        acc[result.type] = (acc[result.type] || 0) + 1;
        return acc;
      }, {});
      
      expect(typeDistribution.simple).toBeGreaterThan(50);
      expect(typeDistribution.streaming).toBeGreaterThan(15);
      expect(typeDistribution.complex).toBeGreaterThan(15);
    });
  });

  describe('stress testing', () => {
    it('should handle memory pressure gracefully', async () => {
      const memoryStressTest = PerformanceHelper.monitorMemoryUsage(async () => {
        // Create memory pressure with large datasets
        const iterations = 20;
        
        for (let i = 0; i < iterations; i++) {
          const largeDocuments = TestDataGenerator.generateDocuments(5000);
          const largeVectors = TestDataGenerator.generateVectors(5000, 1536);
          
          await mockRetriever.store(largeVectors);
          
          // Perform multiple concurrent operations
          const concurrentOps = [];
          for (let j = 0; j < 10; j++) {
            const queryVector = TestDataGenerator.generateVectors(1, 1536)[0].values;
            concurrentOps.push(
              pipeline.run({
                query: `Memory stress query ${i}-${j}`,
                queryVector,
                options: { topK: 100, useReranker: true }
              })
            );
          }
          
          await Promise.all(concurrentOps);
          
          // Simulate garbage collection
          if (global.gc) {
            global.gc();
          }
        }
      });

      const result = await memoryStressTest();
      
      // Memory growth should be controlled
      expect(result.memoryDelta.heapUsed).toBeLessThan(200 * 1024 * 1024); // 200MB max
    });

    it('should recover from temporary failures', async () => {
      // Create flaky components that fail intermittently
      const flakyLLM = {
        async generate(prompt, options = {}) {
          if (Math.random() < 0.1) { // 10% failure rate
            throw new Error('Temporary LLM failure');
          }
          return await mockLLM.generate(prompt, options);
        }
      };

      const flakyRetriever = {
        async store(vectors) {
          return await mockRetriever.store(vectors);
        },
        async retrieve(queryVector, options = {}) {
          if (Math.random() < 0.05) { // 5% failure rate
            throw new Error('Temporary retriever failure');
          }
          return await mockRetriever.retrieve(queryVector, options);
        }
      };

      const resilientPipeline = createRagPipeline({
        llm: flakyLLM,
        retriever: flakyRetriever,
        reranker: mockReranker,
        enableRetry: true,
        retryOptions: { maxAttempts: 3, delay: 100 }
      });

      const stressRequests = 200;
      const promises = [];
      
      for (let i = 0; i < stressRequests; i++) {
        const queryVector = TestDataGenerator.generateVectors(1)[0].values;
        
        promises.push(
          resilientPipeline.run({
            query: `Resilience test query ${i}`,
            queryVector,
            options: { topK: 5 }
          }).catch(error => ({ error: error.message }))
        );
      }

      const results = await Promise.all(promises);
      
      const successfulRequests = results.filter(r => !r.error);
      const failedRequests = results.filter(r => r.error);
      
      // Should recover from most failures due to retry logic
      expect(successfulRequests.length).toBeGreaterThan(stressRequests * 0.85); // 85% success rate
      expect(failedRequests.length).toBeLessThan(stressRequests * 0.15); // 15% failure rate
    });

    it('should handle resource exhaustion scenarios', async () => {
      // Simulate resource exhaustion
      const resourceExhaustionTest = async () => {
        const heavyOperations = [];
        
        // Create many concurrent heavy operations
        for (let i = 0; i < 50; i++) {
          const operation = async () => {
            const largeDataset = TestDataGenerator.generateDocuments(1000);
            const queryVector = TestDataGenerator.generateVectors(1)[0].values;
            
            // Multiple reranking operations (CPU intensive)
            for (let j = 0; j < 5; j++) {
              await mockReranker.rerank(
                `Heavy query ${i}-${j}`,
                largeDataset,
                { topK: 100 }
              );
            }
            
            return `Operation ${i} completed`;
          };
          
          heavyOperations.push(operation());
        }
        
        return await Promise.all(heavyOperations);
      };

      const startTime = Date.now();
      const results = await resourceExhaustionTest();
      const endTime = Date.now();
      
      expect(results).toHaveLength(50);
      expect(endTime - startTime).toBeLessThan(60000); // Complete within 60 seconds
    });
  });

  describe('scalability testing', () => {
    it('should scale linearly with data size', async () => {
      const dataSizes = [1000, 2000, 5000, 10000];
      const scalabilityResults = [];
      
      for (const size of dataSizes) {
        const documents = TestDataGenerator.generateDocuments(size);
        const vectors = TestDataGenerator.generateVectors(size);
        
        const performance = await PerformanceHelper.measureExecutionTime(async () => {
          await mockRetriever.store(vectors);
          
          // Perform standard operations
          const queryVector = TestDataGenerator.generateVectors(1)[0].values;
          const retrievalResult = await mockRetriever.retrieve(queryVector, { topK: 50 });
          const rerankingResult = await mockReranker.rerank(
            'Scalability test query',
            retrievalResult,
            { topK: 20 }
          );
          
          return rerankingResult;
        });
        
        scalabilityResults.push({
          dataSize: size,
          duration: performance.duration,
          throughput: size / (performance.duration / 1000)
        });
      }
      
      // Check that performance scales reasonably
      const firstResult = scalabilityResults[0];
      const lastResult = scalabilityResults[scalabilityResults.length - 1];
      
      // Throughput shouldn't degrade more than 2x
      expect(lastResult.throughput).toBeGreaterThan(firstResult.throughput * 0.5);
    });

    it('should handle increasing concurrent users gracefully', async () => {
      const concurrencyLevels = [10, 25, 50, 100];
      const concurrencyResults = [];
      
      // Setup baseline data
      const documents = TestDataGenerator.generateDocuments(5000);
      const vectors = TestDataGenerator.generateVectors(5000);
      await mockRetriever.store(vectors);
      
      for (const concurrency of concurrencyLevels) {
        const startTime = Date.now();
        const promises = [];
        
        for (let i = 0; i < concurrency; i++) {
          const queryVector = TestDataGenerator.generateVectors(1)[0].values;
          
          promises.push(
            pipeline.run({
              query: `Concurrency test ${concurrency}-${i}`,
              queryVector,
              options: { topK: 10 }
            })
          );
        }
        
        await Promise.all(promises);
        const endTime = Date.now();
        
        concurrencyResults.push({
          concurrency,
          totalDuration: endTime - startTime,
          avgResponseTime: (endTime - startTime) / concurrency
        });
      }
      
      // Response time shouldn't increase exponentially
      const lowConcurrency = concurrencyResults.find(r => r.concurrency === 10);
      const highConcurrency = concurrencyResults.find(r => r.concurrency === 100);
      
      expect(highConcurrency.avgResponseTime).toBeLessThan(lowConcurrency.avgResponseTime * 5);
    });
  });

  describe('endurance testing', () => {
    it('should maintain performance over extended periods', async () => {
      const enduranceTest = async () => {
        const testDuration = 30000; // 30 seconds
        const startTime = Date.now();
        const results = [];
        
        while (Date.now() - startTime < testDuration) {
          const iterationStart = Date.now();
          
          const queryVector = TestDataGenerator.generateVectors(1)[0].values;
          await pipeline.run({
            query: `Endurance test query ${results.length}`,
            queryVector,
            options: { topK: 5 }
          });
          
          const iterationDuration = Date.now() - iterationStart;
          results.push(iterationDuration);
          
          // Small delay to prevent overwhelming
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        return results;
      };

      const durations = await enduranceTest();
      
      expect(durations.length).toBeGreaterThan(50); // Completed many iterations
      
      // Performance should remain stable
      const firstHalf = durations.slice(0, Math.floor(durations.length / 2));
      const secondHalf = durations.slice(Math.floor(durations.length / 2));
      
      const firstHalfAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      
      // Performance shouldn't degrade more than 50%
      expect(secondHalfAvg).toBeLessThan(firstHalfAvg * 1.5);
    });

    it('should handle memory stability over time', async () => {
      const memoryStabilityTest = PerformanceHelper.monitorMemoryUsage(async () => {
        const iterations = 1000;
        
        for (let i = 0; i < iterations; i++) {
          const queryVector = TestDataGenerator.generateVectors(1)[0].values;
          
          await pipeline.run({
            query: `Memory stability test ${i}`,
            queryVector,
            options: { topK: 5 }
          });
          
          // Periodic cleanup simulation
          if (i % 100 === 0 && global.gc) {
            global.gc();
          }
        }
      });

      const result = await memoryStabilityTest();
      
      // Memory growth should be minimal for repeated operations
      expect(result.memoryDelta.heapUsed).toBeLessThan(100 * 1024 * 1024); // 100MB max
    });
  });
});
