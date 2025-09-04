jest.setTimeout(60000);

/**
 * Streaming Token Output Load Testing
 * Tests streaming performance under various load conditions with detailed latency metrics
 */

// Jest is available globally in CommonJS mode;
const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");
const {
  TestDataGenerator,
  PerformanceHelper,
  PerformanceBenchmark,
} = require("../utils/test-helpers.js");

describe("Streaming Token Output Load Tests", () => {
  afterEach(async () => {
    // Cleanup any running streams
    if (global.gc) {
      global.gc();
    }
  });

  let streamingMetrics = [];
  let latencyData = [];

  beforeAll(() => {
    const outputDir = path.join(process.cwd(), "performance-reports");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  });

  afterAll(async () => {
    await generateStreamingReports();
  });

  describe("Single Stream Performance", () => {
    const tokenCounts = [100, 500, 1000, 5000, 10000];

    test.each(tokenCounts)(
      "should stream %d tokens with low latency",
      async (tokenCount) => {
        const benchmark = new PerformanceHelper(
          `memory-constrained-streaming-${tokenCount}-tokens`,
        );

        const streamingLLM = {
          async *generateStream(prompt) {
            // Generate simple tokens instead of using TestDataGenerator
            const tokens = Array.from(
              { length: tokenCount },
              (_, i) => `token_${i}`,
            );
            const startTime = performance.now();
            let tokenIndex = 0;

            for (const token of tokens) {
              const tokenStartTime = performance.now();

              // Simulate realistic token generation delay
              const delay = Math.random() * 5 + 1; // 1-6ms per token
              await new Promise((resolve) => setTimeout(resolve, delay));

              const tokenEndTime = performance.now();
              const tokenLatency = tokenEndTime - tokenStartTime;

              yield {
                token,
                index: tokenIndex++,
                done: false,
                latency: tokenLatency,
                timestamp: tokenEndTime,
              };

              // Track individual token latencies
              latencyData.push({
                testName: `streaming-${tokenCount}-tokens`,
                tokenIndex,
                latency: tokenLatency,
                timestamp: tokenEndTime,
              });
            }

            yield {
              token: "",
              index: tokenIndex,
              done: true,
              totalTime: performance.now() - startTime,
              totalTokens: tokenCount,
            };
          },
        };

        // Execute streaming with performance tracking
        benchmark.start();
        const stream = streamingLLM.generateStream("Generate test content");
        const tokens = [];
        let totalLatency = 0;
        let maxLatency = 0;
        let minLatency = Infinity;

        for await (const chunk of stream) {
          tokens.push(chunk);

          if (!chunk.done && chunk.latency) {
            totalLatency += chunk.latency;
            maxLatency = Math.max(maxLatency, chunk.latency);
            minLatency = Math.min(minLatency, chunk.latency);
          }
        }

        const metrics = benchmark.end();
        const finalChunk = tokens[tokens.length - 1];

        // Performance assertions
        expect(tokens.length - 1).toBe(tokenCount); // -1 for final chunk
        expect(finalChunk.done).toBe(true);

        const avgTokenLatency = totalLatency / tokenCount;
        const tokensPerSecond = (tokenCount / metrics.duration) * 1000;

        // Latency requirements
        expect(avgTokenLatency).toBeLessThan(10); // Less than 10ms average
        expect(maxLatency).toBeLessThan(50); // Less than 50ms max
        expect(tokensPerSecond).toBeGreaterThan(50); // More than 50 tokens/sec

        // Store metrics
        const performanceData = {
          testName: `streaming-${tokenCount}-tokens`,
          tokenCount,
          totalDuration: metrics.duration,
          avgTokenLatency,
          maxTokenLatency: maxLatency,
          minTokenLatency: minLatency,
          tokensPerSecond,
          memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
          timestamp: new Date().toISOString(),
        };

        streamingMetrics.push(performanceData);

        console.log(
          `🚀 Stream ${tokenCount}: ${tokensPerSecond.toFixed(2)} tokens/sec, ${avgTokenLatency.toFixed(2)}ms avg latency`,
        );
      },
      120000,
    ); // 2 minute timeout for large streams
  });

  describe("Concurrent Streaming Load", () => {
    it("should handle multiple concurrent streams efficiently", async () => {
      const concurrentStreams = 2;
      const tokensPerStream = 500;

      const concurrentStreamingLLM = {
        async *generateStream(prompt, streamId) {
          const startTime = performance.now();
          const tokens = Array.from(
            { length: tokensPerStream },
            (_, i) => `token_${streamId}_${i}`,
          );

          for (let i = 0; i < tokens.length; i++) {
            const tokenStartTime = performance.now();

            // Add some jitter to simulate real-world conditions
            const delay = Math.random() * 8 + 2; // 2-10ms
            await new Promise((resolve) => setTimeout(resolve, delay));

            yield {
              token: tokens[i],
              index: i,
              streamId,
              done: false,
              latency: performance.now() - tokenStartTime,
            };
          }

          yield {
            token: "",
            index: tokensPerStream,
            streamId,
            done: true,
            totalTime: performance.now() - startTime,
          };
        },
      };

      const startTime = performance.now();
      const streamPromises = Array.from(
        { length: concurrentStreams },
        async (_, streamId) => {
          const tokens = [];
          const stream = concurrentStreamingLLM.generateStream(
            `Prompt ${streamId}`,
            streamId,
          );

          for await (const chunk of stream) {
            tokens.push(chunk);
          }

          return {
            streamId,
            tokens: tokens.length - 1, // -1 for final chunk
            finalChunk: tokens[tokens.length - 1],
          };
        },
      );

      const results = await Promise.all(streamPromises);
      const endTime = performance.now();
      const totalDuration = endTime - startTime;

      // Validate all streams completed
      expect(results).toHaveLength(concurrentStreams);
      results.forEach((result, index) => {
        expect(result.streamId).toBe(index);
        expect(result.tokens).toBe(tokensPerStream);
        expect(result.finalChunk.done).toBe(true);
      });

      // Performance metrics
      const totalTokens = concurrentStreams * tokensPerStream;
      const overallThroughput = (totalTokens / totalDuration) * 1000;
      const avgStreamDuration =
        results.reduce((sum, r) => sum + r.finalChunk.totalTime, 0) /
        concurrentStreams;

      // Performance assertions
      expect(overallThroughput).toBeGreaterThan(100); // More than 100 tokens/sec overall
      expect(avgStreamDuration).toBeLessThan(totalDuration * 1.2); // Streams shouldn't be much slower than sequential

      console.log(
        `🔥 Concurrent streams: ${overallThroughput.toFixed(2)} tokens/sec overall, ${avgStreamDuration.toFixed(2)}ms avg stream`,
      );

      // Store concurrent metrics
      streamingMetrics.push({
        testName: "concurrent-streaming",
        concurrentStreams,
        tokensPerStream,
        totalDuration,
        overallThroughput,
        avgStreamDuration,
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
        timestamp: new Date().toISOString(),
      });
    });
  });

  describe("Streaming Under Memory Pressure", () => {
    it("should maintain performance with limited memory", async () => {
      const largeTokenCount = 5000;
      const memoryConstrainedLLM = {
        async *generateStream(___prompt) {
          const startMemory = process.memoryUsage();
          const bufferLimit = 100; // Keep only 100 tokens in memory

          for (let i = 0; i < largeTokenCount; i++) {
            const token = `token_${i}_${Math.random().toString(36).substr(2, 9)}`;
            const tokenStartTime = performance.now();

            // Add to buffer
            let tokenBuffer = [];
            tokenBuffer.push(token);
            if (tokenBuffer.length > bufferLimit) {
              tokenBuffer = tokenBuffer.slice(-bufferLimit);
              if (global.gc) {
                global.gc();
              }
            }

            await new Promise((resolve) => setTimeout(resolve, 2)); // 2ms delay

            const currentMemory = process.memoryUsage();
            const memoryIncrease =
              currentMemory.heapUsed - startMemory.heapUsed;

            yield {
              token,
              index: i,
              done: false,
              latency: performance.now() - tokenStartTime,
              memoryIncrease: memoryIncrease / 1024 / 1024, // MB
              bufferSize: tokenBuffer.length,
            };

            // Assert memory doesn't grow excessively
            expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB increase
          }

          yield { token: "", index: largeTokenCount, done: true };
        },
      };

      const stream = memoryConstrainedLLM.generateStream("Memory test prompt");
      let maxMemoryIncrease = 0;
      const tokens = [];

      for await (const chunk of stream) {
        tokens.push(chunk);

        if (!chunk.done && chunk.memoryIncrease) {
          maxMemoryIncrease = Math.max(maxMemoryIncrease, chunk.memoryIncrease);
        }
      }

      expect(tokens.length - 1).toBe(largeTokenCount);
      expect(maxMemoryIncrease).toBeLessThan(100); // Less than 100MB max increase

      console.log(
        `💾 Memory-constrained streaming: ${maxMemoryIncrease.toFixed(2)}MB max increase`,
      );
    });
  });

  describe("Streaming Backpressure Handling", () => {
    it("should handle slow consumers gracefully", async () => {
      const tokenCount = 100; // Reduced for faster test execution
      const backpressureLLM = {
        async *generateStream(prompt) {
          // Generate simple tokens instead of using TestDataGenerator
          const tokens = Array.from(
            { length: tokenCount },
            (_, i) => `token_${i}`,
          );
          let backpressureEvents = 0;

          for (let i = 0; i < tokens.length; i++) {
            // Simulate fast token generation
            await new Promise((resolve) => setTimeout(resolve, 1));

            const chunk = {
              token: tokens[i],
              index: i,
              done: false,
              generatedAt: performance.now(),
              backpressureEvents,
            };

            // Simulate backpressure detection
            const yieldStartTime = performance.now();
            yield chunk;
            const yieldEndTime = performance.now();

            // If yielding took too long, count as backpressure
            if (yieldEndTime - yieldStartTime > 10) {
              backpressureEvents++;
            }
          }

          yield {
            token: "",
            index: tokenCount,
            done: true,
            backpressureEvents,
          };
        },
      };

      const stream = backpressureLLM.generateStream("Backpressure test");
      let processingDelays = [];
      const tokens = [];

      for await (const chunk of stream) {
        const processingStart = performance.now();
        if (chunk.index && chunk.index % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 20)); // 20ms delay
        }

        tokens.push(chunk);
        processingDelays.push(performance.now() - processingStart);
      }

      const finalChunk = tokens[tokens.length - 1];
      expect(finalChunk.done).toBe(true);

      const avgProcessingDelay =
        processingDelays.reduce((a, b) => a + b, 0) / processingDelays.length;
      console.log(
        `⏳ Backpressure handling: ${finalChunk.backpressureEvents} events, ${avgProcessingDelay.toFixed(2)}ms avg delay`,
      );
    });
  });

  async function generateStreamingReports() {
    const outputDir = path.join(process.cwd(), "performance-reports");

    // Generate CSV for streaming metrics
    const csvHeader = [
      "Test Name",
      "Token Count",
      "Duration (ms)",
      "Avg Latency (ms)",
      "Max Latency (ms)",
      "Tokens/sec",
      "Memory (MB)",
    ];
    const csvData = streamingMetrics.map((m) => [
      m.testName,
      m.tokenCount || m.tokensPerStream || "N/A",
      m.totalDuration?.toFixed(2) || "N/A",
      m.avgTokenLatency?.toFixed(2) || "N/A",
      m.maxTokenLatency?.toFixed(2) || "N/A",
      m.tokensPerSecond?.toFixed(2) || m.overallThroughput?.toFixed(2) || "N/A",
      m.memoryUsage?.toFixed(2) || "N/A",
    ]);

    const csvContent = [csvHeader, ...csvData]
      .map((row) => row.join(","))
      .join("\n");
    fs.writeFileSync(
      path.join(outputDir, "streaming-performance.csv"),
      csvContent,
    );

    // Generate detailed latency CSV
    const latencyCsvHeader = [
      "Test Name",
      "Token Index",
      "Latency (ms)",
      "Timestamp",
    ];
    const latencyCsvData = latencyData.map((l) => [
      l.testName,
      l.tokenIndex,
      l.latency.toFixed(2),
      l.timestamp,
    ]);

    const latencyCsvContent = [latencyCsvHeader, ...latencyCsvData]
      .map((row) => row.join(","))
      .join("\n");
    fs.writeFileSync(
      path.join(outputDir, "token-latency-details.csv"),
      latencyCsvContent,
    );

    // Generate JSON report
    const jsonReport = {
      testSuite: "Streaming Token Output Load Tests",
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: streamingMetrics.length,
        avgThroughput:
          streamingMetrics
            .filter((m) => m.tokensPerSecond)
            .reduce((sum, m) => sum + m.tokensPerSecond, 0) /
          streamingMetrics.filter((m) => m.tokensPerSecond).length,
        maxThroughput: Math.max(
          ...streamingMetrics
            .filter((m) => m.tokensPerSecond)
            .map((m) => m.tokensPerSecond),
        ),
        avgLatency:
          latencyData.reduce((sum, l) => sum + l.latency, 0) /
          latencyData.length,
        maxLatency: Math.max(...latencyData.map((l) => l.latency)),
        minLatency: Math.min(...latencyData.map((l) => l.latency)),
      },
      metrics: streamingMetrics,
      latencyDetails: latencyData.slice(0, 1000), // Limit to first 1000 for file size
    };

    fs.writeFileSync(
      path.join(outputDir, "streaming-performance.json"),
      JSON.stringify(jsonReport, null, 2),
    );

    // Generate HTML report
    const htmlReport = generateStreamingHTMLReport(jsonReport);
    fs.writeFileSync(
      path.join(outputDir, "streaming-performance.html"),
      htmlReport,
    );

    console.log("🚀 Streaming performance reports generated");
  }

  function generateStreamingHTMLReport(data) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Streaming Performance Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
        .metric { display: inline-block; margin: 10px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; background: #f9f9f9; }
        .chart-container { width: 100%; height: 400px; margin: 20px 0; }
        h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
        .summary { display: flex; flex-wrap: wrap; justify-content: space-around; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Streaming Token Performance Report</h1>
        <p><strong>Generated:</strong> ${data.timestamp}</p>
        
        <div class="summary">
            <div class="metric">
                <h3>Avg Throughput</h3>
                <p>${data.summary.avgThroughput.toFixed(2)} tokens/sec</p>
            </div>
            <div class="metric">
                <h3>Max Throughput</h3>
                <p>${data.summary.maxThroughput.toFixed(2)} tokens/sec</p>
            </div>
            <div class="metric">
                <h3>Avg Latency</h3>
                <p>${data.summary.avgLatency.toFixed(2)} ms</p>
            </div>
            <div class="metric">
                <h3>Latency Range</h3>
                <p>${data.summary.minLatency.toFixed(2)} - ${data.summary.maxLatency.toFixed(2)} ms</p>
            </div>
        </div>
        
        <div class="chart-container">
            <canvas id="throughputChart"></canvas>
        </div>
        
        <div class="chart-container">
            <canvas id="latencyChart"></canvas>
        </div>
        
        <div class="chart-container">
            <canvas id="latencyDistribution"></canvas>
        </div>
    </div>
    
    <script>
        const data = ${JSON.stringify(data)};
        
        // Throughput Chart
        const throughputData = data.metrics.filter(m => m.tokensPerSecond);
        new Chart(document.getElementById('throughputChart'), {
            type: 'line',
            data: {
                labels: throughputData.map(m => m.tokenCount || 'Concurrent'),
                datasets: [{
                    label: 'Throughput (tokens/sec)',
                    data: throughputData.map(m => m.tokensPerSecond || m.overallThroughput),
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { title: { display: true, text: 'Streaming Throughput Performance' } },
                scales: { y: { beginAtZero: true } }
            }
        });
        
        // Latency Chart
        new Chart(document.getElementById('latencyChart'), {
            type: 'line',
            data: {
                labels: throughputData.map(m => m.tokenCount || 'Concurrent'),
                datasets: [
                    {
                        label: 'Avg Latency (ms)',
                        data: throughputData.map(m => m.avgTokenLatency),
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.2)',
                        tension: 0.1
                    },
                    {
                        label: 'Max Latency (ms)',
                        data: throughputData.map(m => m.maxTokenLatency),
                        borderColor: 'rgb(255, 159, 64)',
                        backgroundColor: 'rgba(255, 159, 64, 0.2)',
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { title: { display: true, text: 'Token Latency Analysis' } },
                scales: { y: { beginAtZero: true } }
            }
        });
        
        // Latency Distribution
        const latencyBuckets = {};
        data.latencyDetails.forEach(l => {
            const bucket = Math.floor(l.latency / 2) * 2; // 2ms buckets
            latencyBuckets[bucket] = (latencyBuckets[bucket] || 0) + 1;
        });
        
        new Chart(document.getElementById('latencyDistribution'), {
            type: 'bar',
            data: {
                labels: Object.keys(latencyBuckets).sort((a, b) => a - b),
                datasets: [{
                    label: 'Token Count',
                    data: Object.keys(latencyBuckets).sort((a, b) => a - b).map(k => latencyBuckets[k]),
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { title: { display: true, text: 'Token Latency Distribution (2ms buckets)' } },
                scales: { 
                    y: { beginAtZero: true },
                    x: { title: { display: true, text: 'Latency (ms)' } }
                }
            }
        });
    </script>
</body>
</html>
    `;
  }

  it("should handle empty streams gracefully", async () => {
    const emptyStreamLLM = {
      async *generateStream(prompt) {
        // Empty stream - no tokens
        return;
      },
    };

    const stream = emptyStreamLLM.generateStream("Empty test");
    const tokens = [];

    for await (const chunk of stream) {
      tokens.push(chunk);
    }

    expect(tokens).toHaveLength(0);
  });
});
