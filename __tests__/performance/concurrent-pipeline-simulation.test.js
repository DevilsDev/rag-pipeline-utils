jest.setTimeout(120000);

/**
 * Concurrent Pipeline Simulation Performance Testing
 * Simulates multiple concurrent pipeline runs with realistic workloads
 */

// Jest is available globally in CommonJS mode;
const fs = require('fs');
const path = require('path');
const { performance  } = require('perf_hooks');
const { TestDataGenerator, PerformanceHelper } = require('../utils/test-helpers.js');

describe('Concurrent Pipeline Simulation Tests', () => {
  let concurrencyMetrics = [];
  
  beforeAll(() => {
    const outputDir = path.join(process.cwd(), 'performance-reports');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  });

  afterAll(async () => {
    await generateConcurrencyReports();
  });

  describe('Multi-User Pipeline Simulation', () => {
    const concurrencyLevels = [5, 10, 25, 50, 100];
    
    test.each(concurrencyLevels)('should handle %d concurrent users efficiently', async (userCount) => {
      const benchmark = new PerformanceHelper(`concurrent-users-${userCount}`);
      
      // Create realistic pipeline simulator
      const pipelineSimulator = createRealisticPipelineSimulator();
      
      // Generate diverse user workloads
      const userWorkloads = Array.from({ length: userCount }, (_, userId) => 
        generateUserWorkload(userId)
      );

      benchmark.start();
      const results = await simulateConcurrentUsers(pipelineSimulator, userWorkloads);
      const metrics = benchmark.end();
      
      // Validate all users completed successfully
      expect(results.completedUsers).toBe(userCount);
      expect(results.totalQueries).toBeGreaterThan(userCount);
      
      // Performance assertions
      const avgResponseTime = results.totalResponseTime / results.totalQueries;
      const queriesPerSecond = (results.totalQueries / metrics.duration) * 1000;
      
      expect(avgResponseTime).toBeLessThan(5000); // Less than 5 seconds average
      expect(queriesPerSecond).toBeGreaterThan(userCount * 0.1); // At least 0.1 queries/sec per user
      expect(results.errorRate).toBeLessThan(0.05); // Less than 5% error rate
      
      // Store metrics
      const performanceData = {
        testName: `concurrent-users-${userCount}`,
        userCount,
        totalDuration: metrics.duration,
        totalQueries: results.totalQueries,
        avgResponseTime,
        queriesPerSecond,
        errorRate: results.errorRate,
        memoryPeak: results.memoryPeak / 1024 / 1024,
        cpuUtilization: results.cpuUtilization,
        resourceEfficiency: calculateResourceEfficiency(results),
        timestamp: new Date().toISOString()
      };
      
      concurrencyMetrics.push(performanceData);
      
      console.log(`👥 ${userCount} users: ${queriesPerSecond.toFixed(2)} queries/sec, ${avgResponseTime.toFixed(2)}ms avg response`);
    }, 600000); // 10 minute timeout for high concurrency
  });

  describe('Mixed Workload Patterns', () => {
    it('should handle diverse query patterns efficiently', async () => {
      const workloadPatterns = [
        { type: 'simple', weight: 0.4, complexity: 'low' },
        { type: 'analytical', weight: 0.3, complexity: 'medium' },
        { type: 'complex', weight: 0.2, complexity: 'high' },
        { type: 'streaming', weight: 0.1, complexity: 'variable' }
      ];
      
      const pipelineSimulator = createRealisticPipelineSimulator();
      const mixedWorkload = generateMixedWorkload(100, workloadPatterns);
      
      const benchmark = new PerformanceHelper('mixed-workload-patterns');
      
      benchmark.start();
      const results = await executeMixedWorkload(pipelineSimulator, mixedWorkload);
      const metrics = benchmark.end();
      
      // Validate workload distribution
      expect(results.patternDistribution.simple).toBeCloseTo(40, 5); // ~40% simple queries
      expect(results.patternDistribution.analytical).toBeCloseTo(30, 5); // ~30% analytical
      expect(results.patternDistribution.complex).toBeCloseTo(20, 5); // ~20% complex
      expect(results.patternDistribution.streaming).toBeCloseTo(10, 5); // ~10% streaming
      
      // Performance by pattern
      expect(results.avgResponseByPattern.simple).toBeLessThan(1000); // Simple < 1s
      expect(results.avgResponseByPattern.analytical).toBeLessThan(3000); // Analytical < 3s
      expect(results.avgResponseByPattern.complex).toBeLessThan(8000); // Complex < 8s
      
      console.log('🎯 Mixed workload patterns:', JSON.stringify(results.avgResponseByPattern, null, 2));
      
      // Store mixed workload metrics
      concurrencyMetrics.push({
        testName: 'mixed-workload-patterns',
        totalQueries: mixedWorkload.length,
        totalDuration: metrics.duration,
        patternDistribution: results.patternDistribution,
        avgResponseByPattern: results.avgResponseByPattern,
        resourceUtilization: results.resourceUtilization,
        timestamp: new Date().toISOString()
      });
    });
  });

  // Helper functions
  function createRealisticPipelineSimulator(options = {}) {
    const { enableGarbageCollection = false } = options;
    
    return {
      async executeQuery(query, context = {}) {
        const startTime = performance.now();
        const startMemory = process.memoryUsage();
        
        try {
          // Simulate realistic pipeline stages
          const loaderResult = await this.simulateLoader(query.documents);
          const embedderResult = await this.simulateEmbedder(loaderResult.chunks);
          const retrieverResult = await this.simulateRetriever(embedderResult.embeddings, query);
          const llmResult = await this.simulateLLM(retrieverResult.documents, query);
          
          const endTime = performance.now();
          const endMemory = process.memoryUsage();
          
          // Garbage collection if enabled
          if (enableGarbageCollection && global.gc && Math.random() < 0.1) {
            global.gc();
          }
          
          return {
            success: true,
            result: llmResult,
            responseTime: endTime - startTime,
            memoryUsed: endMemory.heapUsed - startMemory.heapUsed,
            stages: {
              loader: loaderResult.duration,
              embedder: embedderResult.duration,
              retriever: retrieverResult.duration,
              llm: llmResult.duration
            }
          };
        } catch (error) {
          return {
            success: false,
            error: error.message,
            responseTime: performance.now() - startTime
          };
        }
      },
      
      async simulateLoader(documents) {
        const processingTime = documents.length * 2 + Math.random() * 50;
        await new Promise(resolve => setTimeout(resolve, processingTime));
        
        return {
          chunks: documents.flatMap(doc => 
            Array.from({ length: Math.ceil(doc.content?.length / 500) || 1 }, (_, i) => ({
              id: `${doc.id}-chunk-${i}`,
              content: doc.content?.slice(i * 500, (i + 1) * 500) || `chunk ${i}`,
              metadata: doc.metadata
            }))
          ),
          duration: processingTime
        };
      },
      
      async simulateEmbedder(chunks) {
        const processingTime = chunks.length * 5 + Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, processingTime));
        
        return {
          embeddings: chunks.map(chunk => ({
            id: chunk.id,
            values: TestDataGenerator.generateVector(384),
            metadata: chunk.metadata
          })),
          duration: processingTime
        };
      },
      
      async simulateRetriever(embeddings, ___query) {
        const searchTime = Math.log(embeddings.length) * 10 + Math.random() * 50;
        await new Promise(resolve => setTimeout(resolve, searchTime));
        
        const topK = Math.min(10, embeddings.length);
        const results = embeddings
          .slice(0, topK)
          .map(emb => ({
            id: emb.id,
            score: Math.random() * 0.5 + 0.5,
            metadata: emb.metadata
          }));
        
        return {
          documents: results,
          duration: searchTime
        };
      },
      
      async simulateLLM(documents, query) {
        const complexity = query.complexity || 'medium';
        const baseTime = {
          'low': 200,
          'medium': 500,
          'high': 1200
        }[complexity];
        
        const processingTime = baseTime + Math.random() * baseTime * 0.3;
        await new Promise(resolve => setTimeout(resolve, processingTime));
        
        return {
          text: `Generated response for ${query.type} query`,
          usage: {
            promptTokens: documents.length * 50,
            completionTokens: Math.floor(processingTime / 10),
            totalTokens: documents.length * 50 + Math.floor(processingTime / 10)
          },
          duration: processingTime
        };
      }
    };
  }

  function generateUserWorkload(userId) {
    const queryCount = Math.floor(Math.random() * 5) + 2; // 2-6 queries per user
    
    return {
      userId,
      queries: Array.from({ length: queryCount }, (_, i) => ({
        id: `user-${userId}-query-${i}`,
        type: ['simple', 'analytical', 'complex'][Math.floor(Math.random() * 3)],
        documents: TestDataGenerator.generateDocuments(Math.floor(Math.random() * 20) + 5),
        complexity: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)]
      }))
    };
  }

  function generateMixedWorkload(_queryCount, _patterns) {
    const workload = [];
    
    for (let i = 0; i < _queryCount; i++) {
      const rand = Math.random();
      let cumulativeWeight = 0;
      let selectedPattern = _patterns[0];
      
      for (const pattern of _patterns) {
        cumulativeWeight += pattern.weight;
        if (rand <= cumulativeWeight) {
          selectedPattern = pattern;
          break;
        }
      }
      
      workload.push({
        id: `mixed-query-${i}`,
        type: selectedPattern.type,
        complexity: selectedPattern.complexity,
        documents: TestDataGenerator.generateDocuments(
          selectedPattern.complexity === 'high' ? 50 : 
          selectedPattern.complexity === 'medium' ? 20 : 10
        )
      });
    }
    
    return workload;
  }

  async function simulateConcurrentUsers(_simulator, _userWorkloads) {
    const startTime = performance.now();
    const startMemory = process.memoryUsage();
    let peakMemory = startMemory.heapUsed;
    let totalQueries = 0;
    let totalResponseTime = 0;
    let errors = 0;
    
    // Execute all user workloads concurrently
    const userPromises = _userWorkloads.map(async (userWorkload) => {
      const userResults = [];
      
      for (const query of userWorkload.queries) {
        totalQueries++;
        const result = await _simulator.executeQuery(query);
        userResults.push(result);
        
        if (result.success) {
          totalResponseTime += result.responseTime;
        } else {
          errors++;
        }
        
        // Track peak memory
        const currentMemory = process.memoryUsage().heapUsed;
        peakMemory = Math.max(peakMemory, currentMemory);
      }
      
      return userResults;
    });
    
    await Promise.all(userPromises);
    
    const endTime = performance.now();
    const cpuUtilization = Math.random() * 0.3 + 0.4; // Simulated CPU usage
    
    return {
      completedUsers: _userWorkloads.length,
      totalQueries,
      totalResponseTime,
      errorRate: errors / totalQueries,
      memoryPeak: peakMemory,
      cpuUtilization,
      duration: endTime - startTime
    };
  }

  async function executeMixedWorkload(_simulator, _workload) {
    const patternCounts = {};
    const patternResponseTimes = {};
    
    const promises = _workload.map(async (query) => {
      const result = await _simulator.executeQuery(query);
      
      // Track by pattern
      if (!patternCounts[query.type]) {
        patternCounts[query.type] = 0;
        patternResponseTimes[query.type] = 0;
      }
      
      patternCounts[query.type]++;
      if (result.success) {
        patternResponseTimes[query.type] += result.responseTime;
      }
      
      return result;
    });
    
    await Promise.all(promises);
    
    // Calculate pattern distribution and averages
    const total = _workload.length;
    const patternDistribution = {};
    const avgResponseByPattern = {};
    
    for (const [type, count] of Object.entries(patternCounts)) {
      patternDistribution[type] = (count / total) * 100;
      avgResponseByPattern[type] = patternResponseTimes[type] / count;
    }
    
    return {
      patternDistribution,
      avgResponseByPattern,
      resourceUtilization: Math.random() * 0.4 + 0.3 // Simulated
    };
  }

  function calculateResourceEfficiency(results) {
    // Simple efficiency calculation based on throughput vs resource usage
    const throughputScore = Math.min(results.queriesPerSecond / 10, 1);
    const memoryScore = Math.max(0, 1 - (results.memoryPeak / (1024 * 1024 * 1024)));
    const errorScore = Math.max(0, 1 - results.errorRate * 10);
    
    return (throughputScore + memoryScore + errorScore) / 3;
  }

  async function generateConcurrencyReports() {
    const outputDir = path.join(process.cwd(), 'performance-reports');
    
    // Generate CSV report
    const csvHeader = ['Test Name', 'Users/Queries', 'Duration (ms)', 'Queries/sec', 'Avg Response (ms)', 'Error Rate', 'Memory Peak (MB)', 'Efficiency'];
    const csvData = concurrencyMetrics.map(m => [
      m.testName,
      m.userCount || m.totalQueries || 'N/A',
      m.totalDuration?.toFixed(2) || 'N/A',
      m.queriesPerSecond?.toFixed(2) || 'N/A',
      m.avgResponseTime?.toFixed(2) || 'N/A',
      (m.errorRate * 100)?.toFixed(2) + '%' || 'N/A',
      m.memoryPeak?.toFixed(2) || 'N/A',
      m.resourceEfficiency?.toFixed(3) || 'N/A'
    ]);
    
    const csvContent = [csvHeader, ...csvData].map(row => row.join(',')).join('\n');
    fs.writeFileSync(path.join(outputDir, 'concurrent-pipeline-performance.csv'), csvContent);
    
    // Generate JSON report
    const jsonReport = {
      testSuite: 'Concurrent Pipeline Simulation Tests',
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: concurrencyMetrics.length,
        avgThroughput: concurrencyMetrics.filter(m => m.queriesPerSecond).reduce((sum, m) => sum + m.queriesPerSecond, 0) / concurrencyMetrics.filter(m => m.queriesPerSecond).length,
        maxThroughput: Math.max(...concurrencyMetrics.filter(m => m.queriesPerSecond).map(m => m.queriesPerSecond)),
        avgEfficiency: concurrencyMetrics.filter(m => m.resourceEfficiency).reduce((sum, m) => sum + m.resourceEfficiency, 0) / concurrencyMetrics.filter(m => m.resourceEfficiency).length
      },
      metrics: concurrencyMetrics
    };
    
    fs.writeFileSync(
      path.join(outputDir, 'concurrent-pipeline-performance.json'),
      JSON.stringify(jsonReport, null, 2)
    );
    
    console.log('👥 Concurrent pipeline performance reports generated');
  }
});
