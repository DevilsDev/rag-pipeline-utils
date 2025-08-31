jest.setTimeout(120000);

/**
 * Large Document Batch Performance Testing
 * Tests embedding and processing of large document batches with detailed metrics
 */

// Jest is available globally in CommonJS mode;
const fs = require('fs');
const path = require('path');
const { performance  } = require('perf_hooks');
<<<<<<< Updated upstream
const { TestDataGenerator, PerformanceHelper } = require('../utils/test-helpers.js');
=======
const { TestDataGenerator, PerformanceBenchmark } = require('../utils/test-helpers.js');
>>>>>>> Stashed changes

describe('Large Document Batch Performance Tests', () => {
  let performanceMetrics = [];
  let csvOutput = [];
  
  beforeAll(() => {
    // Ensure output directory exists
    const outputDir = path.join(process.cwd(), 'performance-reports');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  });

  afterAll(async () => {
    // Generate performance reports
    await generatePerformanceReports();
  });

  describe('Embedding Large Document Batches', () => {
    const batchSizes = [100, 500, 1000, 5000, 10000];
    
    test.each(batchSizes)('should process %d documents efficiently', async (batchSize) => {
      const benchmark = new PerformanceHelper(`retrieval-batch-${batchSize}`);
      
      // Generate test documents
      const documents = TestDataGenerator.generateDocuments(batchSize, {
        minLength: 100,
        maxLength: 2000,
        includeMetadata: true
      });

      const mockEmbedder = {
        async embed(docs) {
          const startTime = performance.now();
          
          // Simulate realistic embedding processing time
          const processingTime = Math.max(50, docs.length * 0.5); // 0.5ms per doc minimum
          await new Promise(resolve => setTimeout(resolve, processingTime));
          
          const embeddings = docs.map((doc, index) => ({
            id: doc.id,
            values: TestDataGenerator.generateVector(384),
            metadata: { ...doc.metadata, embeddingIndex: index }
          }));

          const endTime = performance.now();
          const duration = endTime - startTime;
          
          return {
            embeddings,
            metrics: {
              totalDocuments: docs.length,
              processingTime: duration,
              avgTimePerDoc: duration / docs.length,
              throughput: (docs.length / duration) * 1000, // docs per second
              memoryUsage: process.memoryUsage()
            }
          };
        }
      };

      // Execute embedding with performance tracking
      benchmark.start();
      const result = await mockEmbedder.embed(documents);
      const metrics = benchmark.end();

      // Validate results
      expect(result.embeddings).toHaveLength(batchSize);
      expect(result.metrics.totalDocuments).toBe(batchSize);
      
      // Performance assertions
      expect(result.metrics.avgTimePerDoc).toBeLessThan(10); // Less than 10ms per doc
      expect(result.metrics.throughput).toBeGreaterThan(10); // More than 10 docs/sec
      
      // Store metrics for reporting
      const performanceData = {
        testName: `embedding-batch-${batchSize}`,
        batchSize,
        duration: metrics.duration,
        avgTimePerDoc: result.metrics.avgTimePerDoc,
        throughput: result.metrics.throughput,
        memoryUsage: result.metrics.memoryUsage.heapUsed / 1024 / 1024, // MB
        timestamp: new Date().toISOString()
      };
      
      performanceMetrics.push(performanceData);
      csvOutput.push([
        batchSize,
        metrics.duration.toFixed(2),
        result.metrics.avgTimePerDoc.toFixed(2),
        result.metrics.throughput.toFixed(2),
        (result.metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)
      ]);

      console.log(`📊 Batch ${batchSize}: ${metrics.duration.toFixed(2)}ms, ${result.metrics.throughput.toFixed(2)} docs/sec`);
    }, 60000); // 60 second timeout for large batches

    it('should handle memory pressure gracefully', async () => {
      const largeDocuments = TestDataGenerator.generateDocuments(1000, {
        minLength: 5000,
        maxLength: 10000 // Large documents
      });

      const memoryAwareEmbedder = {
        async embed(docs) {
          const startMemory = process.memoryUsage();
          const chunkSize = 100; // Process in chunks
          const results = [];
          
          for (let i = 0; i < docs.length; i += chunkSize) {
            const chunk = docs.slice(i, i + chunkSize);
            const chunkResults = chunk.map(doc => ({
              id: doc.id,
              values: TestDataGenerator.generateVector(384),
              metadata: doc.metadata
            }));
            
            results.push(...chunkResults);
            
            // Force garbage collection if available
            if (global.gc) {
              global.gc();
            }
            
            // Check memory usage
            const currentMemory = process.memoryUsage();
            const memoryIncrease = currentMemory.heapUsed - startMemory.heapUsed;
            
            // Assert memory doesn't grow excessively
            expect(memoryIncrease).toBeLessThan(500 * 1024 * 1024); // Less than 500MB increase
          }
          
          return { embeddings: results, memoryManaged: true };
        }
      };

      const result = await memoryAwareEmbedder.embed(largeDocuments);
      expect(result.embeddings).toHaveLength(1000);
      expect(result.memoryManaged).toBe(true);
    });
  });

  describe('Parallel Embedding Processing', () => {
    it('should process multiple batches concurrently', async () => {
      const concurrentBatches = 5;
      const batchSize = 200;
      
      const parallelEmbedder = {
        async embed(docs) {
          const processingTime = 100 + Math.random() * 100; // 100-200ms
          await new Promise(resolve => setTimeout(resolve, processingTime));
          
          return {
            embeddings: docs.map(doc => ({
              id: doc.id,
              values: TestDataGenerator.generateVector(384),
              metadata: doc.metadata
            })),
            processingTime
          };
        }
      };

      const batches = Array.from({ length: concurrentBatches }, () => 
        TestDataGenerator.generateDocuments(batchSize)
      );

      const startTime = performance.now();
      
      // Process all batches concurrently
      const results = await Promise.all(
        batches.map(batch => parallelEmbedder.embed(batch))
      );
      
      const endTime = performance.now();
      const totalDuration = endTime - startTime;
      
      // Validate all batches processed
      expect(results).toHaveLength(concurrentBatches);
      results.forEach(result => {
        expect(result.embeddings).toHaveLength(batchSize);
      });
      
      // Performance assertion - should be faster than sequential
      const sequentialEstimate = results.reduce((sum, r) => sum + r.processingTime, 0);
      expect(totalDuration).toBeLessThan(sequentialEstimate * 0.8); // At least 20% faster
      
      console.log(`🚀 Parallel processing: ${totalDuration.toFixed(2)}ms vs ${sequentialEstimate.toFixed(2)}ms sequential`);
    });
  });

  describe('Embedding Quality vs Performance Trade-offs', () => {
    it('should maintain quality with optimized processing', async () => {
      const documents = TestDataGenerator.generateDocuments(1000);
      
      const optimizedEmbedder = {
        async embed(docs, options = {}) {
          const { quality = 'standard', batchSize = 100 } = options;
          
          const qualityMultiplier = {
            'fast': 0.5,
            'standard': 1.0,
            'high': 2.0
          }[quality];
          
          const baseProcessingTime = docs.length * qualityMultiplier;
          await new Promise(resolve => setTimeout(resolve, baseProcessingTime));
          
          return {
            embeddings: docs.map(doc => ({
              id: doc.id,
              values: TestDataGenerator.generateVector(384),
              metadata: { ...doc.metadata, quality }
            })),
            quality,
            processingTime: baseProcessingTime
          };
        }
      };

      // Test different quality settings
      const qualityLevels = ['fast', 'standard', 'high'];
      const results = {};
      
      for (const quality of qualityLevels) {
        const startTime = performance.now();
        const result = await optimizedEmbedder.embed(documents, { quality });
        const endTime = performance.now();
        
        results[quality] = {
          duration: endTime - startTime,
          embeddings: result.embeddings.length,
          quality: result.quality
        };
      }
      
      // Validate quality vs performance trade-off
      expect(results.fast.duration).toBeLessThan(results.standard.duration);
      expect(results.standard.duration).toBeLessThan(results.high.duration);
      
      // All should produce same number of embeddings
      Object.values(results).forEach(result => {
        expect(result.embeddings).toBe(1000);
      });
      
      console.log('📈 Quality vs Performance:', JSON.stringify(results, null, 2));
    });
  });

  async function generatePerformanceReports() {
    const outputDir = path.join(process.cwd(), 'performance-reports');
    
    // Generate CSV report
    const csvHeader = ['Batch Size', 'Duration (ms)', 'Avg Time/Doc (ms)', 'Throughput (docs/sec)', 'Memory (MB)'];
    const csvContent = [csvHeader, ...csvOutput].map(row => row.join(',')).join('\n');
    
    fs.writeFileSync(
      path.join(outputDir, 'large-batch-performance.csv'),
      csvContent
    );
    
    // Generate JSON report
    const jsonReport = {
      testSuite: 'Large Document Batch Performance',
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: performanceMetrics.length,
        avgThroughput: performanceMetrics.reduce((sum, m) => sum + m.throughput, 0) / performanceMetrics.length,
        maxThroughput: Math.max(...performanceMetrics.map(m => m.throughput)),
        avgMemoryUsage: performanceMetrics.reduce((sum, m) => sum + m.memoryUsage, 0) / performanceMetrics.length
      },
      metrics: performanceMetrics
    };
    
    fs.writeFileSync(
      path.join(outputDir, 'large-batch-performance.json'),
      JSON.stringify(jsonReport, null, 2)
    );
    
    // Generate HTML report
    const htmlReport = generateHTMLReport(jsonReport);
    fs.writeFileSync(
      path.join(outputDir, 'large-batch-performance.html'),
      htmlReport
    );
    
    console.log('📊 Performance reports generated in:', outputDir);
  }

  function generateHTMLReport(data) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Large Batch Performance Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .metric { display: inline-block; margin: 10px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .chart-container { width: 800px; height: 400px; margin: 20px 0; }
    </style>
</head>
<body>
    <h1>📊 Large Document Batch Performance Report</h1>
    <p>Generated: ${data.timestamp}</p>
    
    <div class="summary">
        <div class="metric">
            <h3>Avg Throughput</h3>
            <p>${data.summary.avgThroughput.toFixed(2)} docs/sec</p>
        </div>
        <div class="metric">
            <h3>Max Throughput</h3>
            <p>${data.summary.maxThroughput.toFixed(2)} docs/sec</p>
        </div>
        <div class="metric">
            <h3>Avg Memory Usage</h3>
            <p>${data.summary.avgMemoryUsage.toFixed(2)} MB</p>
        </div>
    </div>
    
    <div class="chart-container">
        <canvas id="throughputChart"></canvas>
    </div>
    
    <div class="chart-container">
        <canvas id="memoryChart"></canvas>
    </div>
    
    <script>
        const data = ${JSON.stringify(data)};
        
        // Throughput Chart
        new Chart(document.getElementById('throughputChart'), {
            type: 'line',
            data: {
                labels: data.metrics.map(m => m.batchSize),
                datasets: [{
                    label: 'Throughput (docs/sec)',
                    data: data.metrics.map(m => m.throughput),
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                plugins: { title: { display: true, text: 'Throughput vs Batch Size' } }
            }
        });
        
        // Memory Chart
        new Chart(document.getElementById('memoryChart'), {
            type: 'bar',
            data: {
                labels: data.metrics.map(m => m.batchSize),
                datasets: [{
                    label: 'Memory Usage (MB)',
                    data: data.metrics.map(m => m.memoryUsage),
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: { title: { display: true, text: 'Memory Usage vs Batch Size' } }
            }
        });
    </script>
</body>
</html>
    `;
  }
});
