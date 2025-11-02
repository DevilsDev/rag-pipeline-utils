#!/usr/bin/env node
/**
 * @fileoverview Performance Benchmarking Suite
 * Comprehensive performance testing for DAG execution, retry policies, and system components
 *
 * @author DevilsDev Team
 * @since 2.1.8
 */

const { performance } = require("perf_hooks");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { EnhancedDAGEngine } = require("../src/dag/enhanced-dag-engine.js");
const { createRetryPolicy } = require("../src/utils/retry-policy.js");
const {
  createPerformanceMonitor,
} = require("../src/utils/performance-monitor.js");
const { createLogger } = require("../src/utils/structured-logger.js");

/**
 * Benchmark suite for performance testing
 */
class BenchmarkSuite {
  constructor(options = {}) {
    this.outputDir =
      options.outputDir || path.join(process.cwd(), "benchmark-results");
    this.iterations = options.iterations || 100;
    this.warmupIterations = options.warmupIterations || 10;
    this.verbose = options.verbose || false;

    this.results = {
      timestamp: new Date().toISOString(),
      environment: this.getEnvironmentInfo(),
      benchmarks: {},
    };

    this.logger = createLogger({
      serviceName: "benchmark-suite",
      logLevel: this.verbose ? "debug" : "info",
      outputFormat: "console",
    });

    this.monitor = createPerformanceMonitor({
      serviceName: "benchmark-suite",
      enableMemoryTracking: true,
      enableCpuTracking: true,
    });
  }

  /**
   * Get environment information
   * @returns {Object} Environment details
   */
  getEnvironmentInfo() {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cpus: require("os").cpus().length,
      totalMemory: Math.round(require("os").totalmem() / 1024 / 1024) + "MB",
      loadAverage: require("os").loadavg(),
    };
  }

  /**
   * Log benchmark message
   * @param {string} message - Message to log
   */
  log(message) {
    this.logger.info(message);
  }

  /**
   * Run benchmark with timing and memory tracking
   * @param {string} name - Benchmark name
   * @param {Function} fn - Function to benchmark
   * @param {number} iterations - Number of iterations
   * @returns {Object} Benchmark results
   */
  async runBenchmark(name, fn, iterations = this.iterations) {
    this.log(`Running benchmark: ${name}`);

    // Warmup
    for (let i = 0; i < this.warmupIterations; i++) {
      await fn();
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const times = [];
    const memoryUsages = [];
    let errors = 0;

    const startMemory = process.memoryUsage();

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      const startMem = process.memoryUsage();

      try {
        await fn();
      } catch (error) {
        errors++;
        if (this.verbose) {
          this.logger.warn(`Benchmark iteration ${i} failed`, {
            error: error.message,
          });
        }
      }

      const endTime = performance.now();
      const endMem = process.memoryUsage();

      times.push(endTime - startTime);
      memoryUsages.push({
        heapUsed: endMem.heapUsed - startMem.heapUsed,
        heapTotal: endMem.heapTotal - startMem.heapTotal,
        external: endMem.external - startMem.external,
      });
    }

    const endMemory = process.memoryUsage();

    // Calculate statistics
    const sortedTimes = times.sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const median = sortedTimes[Math.floor(sortedTimes.length / 2)];
    const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
    const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)];

    const avgMemoryDelta =
      memoryUsages.reduce((sum, usage) => sum + usage.heapUsed, 0) /
      memoryUsages.length;

    const result = {
      name,
      iterations,
      errors,
      successRate: ((iterations - errors) / iterations) * 100,
      timing: {
        mean: Math.round(mean * 100) / 100,
        median: Math.round(median * 100) / 100,
        min: Math.round(Math.min(...times) * 100) / 100,
        max: Math.round(Math.max(...times) * 100) / 100,
        p95: Math.round(p95 * 100) / 100,
        p99: Math.round(p99 * 100) / 100,
        standardDeviation:
          Math.round(
            Math.sqrt(
              times.reduce((sum, time) => sum + Math.pow(time - mean, 2), 0) /
                times.length,
            ) * 100,
          ) / 100,
      },
      memory: {
        avgDeltaHeapUsed: Math.round(avgMemoryDelta / 1024) + "KB",
        totalHeapDelta:
          Math.round((endMemory.heapUsed - startMemory.heapUsed) / 1024) + "KB",
        peakHeapUsed:
          Math.round(Math.max(...memoryUsages.map((m) => m.heapUsed)) / 1024) +
          "KB",
      },
      throughput: Math.round((iterations / (mean / 1000)) * 100) / 100, // ops/sec
    };

    this.results.benchmarks[name] = result;

    this.log(
      `✅ ${name}: ${result.timing.mean}ms avg, ${result.throughput} ops/sec`,
    );

    return result;
  }

  /**
   * Benchmark DAG execution performance
   */
  async benchmarkDAGExecution() {
    const sizes = [5, 10, 25, 50];

    for (const size of sizes) {
      await this.runBenchmark(
        `DAG execution (${size} nodes)`,
        async () => {
          const dag = new EnhancedDAGEngine({ enableMetrics: false });

          // Create a linear chain of nodes
          for (let i = 0; i < size; i++) {
            dag.addNode(`node-${i}`, async (input) => {
              // Simulate some work
              const start = performance.now();
              while (performance.now() - start < Math.random() * 2) {
                // Busy wait for 0-2ms
              }
              return { nodeId: `node-${i}`, value: Math.random() };
            });

            if (i > 0) {
              dag.connect(`node-${i - 1}`, `node-${i}`);
            }
          }

          const result = await dag.execute({ seed: "test" });
          return result;
        },
        50,
      ); // Fewer iterations for larger DAGs
    }
  }

  /**
   * Benchmark concurrent DAG execution
   */
  async benchmarkConcurrentDAG() {
    const concurrencyLevels = [1, 2, 5, 10];

    for (const concurrency of concurrencyLevels) {
      await this.runBenchmark(
        `Concurrent DAG (${concurrency} concurrency)`,
        async () => {
          const dag = new EnhancedDAGEngine({
            enableMetrics: false,
            enableTracing: false,
          });

          // Create a tree structure that can be executed concurrently
          for (let i = 0; i < 20; i++) {
            dag.addNode(`node-${i}`, async (input) => {
              await new Promise((resolve) =>
                setTimeout(resolve, Math.random() * 5),
              );
              return { nodeId: `node-${i}`, value: Math.random() };
            });
          }

          // Connect nodes in a tree pattern
          for (let i = 1; i < 20; i++) {
            const parentIndex = Math.floor((i - 1) / 2);
            dag.connect(`node-${parentIndex}`, `node-${i}`);
          }

          const result = await dag.execute({ seed: "test" }, { concurrency });
          return result;
        },
        20,
      );
    }
  }

  /**
   * Benchmark retry policy performance
   */
  async benchmarkRetryPolicies() {
    const policies = [
      { name: "No Retry", maxRetries: 0 },
      { name: "Conservative", maxRetries: 2, baseDelay: 1000 },
      { name: "Aggressive", maxRetries: 5, baseDelay: 100 },
    ];

    for (const policyConfig of policies) {
      await this.runBenchmark(
        `Retry Policy: ${policyConfig.name}`,
        async () => {
          const policy = createRetryPolicy({
            maxRetries: policyConfig.maxRetries,
            baseDelay: policyConfig.baseDelay || 500,
            maxDelay: 5000,
            circuitBreaker: { enabled: false }, // Disable for benchmarking
            retryBudget: { enabled: false },
            sleep: (ms) =>
              new Promise((resolve) =>
                setTimeout(resolve, Math.max(1, ms / 10)),
              ), // Faster for benchmarking
          });

          let attempts = 0;
          const result = await policy.execute(async () => {
            attempts++;
            // Fail 30% of the time
            if (Math.random() < 0.3) {
              throw new Error("Simulated failure");
            }
            return { success: true, attempts };
          });

          return result;
        },
        50,
      );
    }
  }

  /**
   * Benchmark structured logging performance
   */
  async benchmarkLogging() {
    const loggers = [
      {
        name: "JSON Format",
        logger: createLogger({ outputFormat: "json", enableMetrics: false }),
      },
      {
        name: "Console Format",
        logger: createLogger({ outputFormat: "console", enableMetrics: false }),
      },
      {
        name: "With Correlation",
        logger: createLogger({
          outputFormat: "json",
          enableCorrelation: true,
          enableMetrics: false,
        }),
      },
    ];

    // Temporarily suppress console output
    const originalConsoleLog = console.log;
    console.log = () => {};

    try {
      for (const { name, logger } of loggers) {
        await this.runBenchmark(`Logging: ${name}`, async () => {
          logger.info("Test log message", {
            component: "benchmark",
            operation: "test",
            data: { key: "value", number: 123 },
          });
        });
      }
    } finally {
      console.log = originalConsoleLog;
    }
  }

  /**
   * Benchmark memory usage patterns
   */
  async benchmarkMemoryUsage() {
    await this.runBenchmark("Memory Allocation", async () => {
      // Create various data structures
      const array = new Array(1000).fill(null).map(() => ({
        id: crypto.randomUUID(),
        data: Math.random().toString(36),
        timestamp: Date.now(),
      }));

      const map = new Map();
      for (let i = 0; i < 1000; i++) {
        map.set(`key-${i}`, { value: Math.random() });
      }

      const set = new Set(array.map((item) => item.id));

      // Simulate processing
      const processed = array
        .filter((item) => item.data.length > 10)
        .map((item) => ({ ...item, processed: true }))
        .sort((a, b) => a.timestamp - b.timestamp);

      return {
        arrayLength: array.length,
        mapSize: map.size,
        setSize: set.size,
        processedLength: processed.length,
      };
    });
  }

  /**
   * Run CPU intensive benchmark
   */
  async benchmarkCPUIntensive() {
    await this.runBenchmark(
      "CPU Intensive Operations",
      async () => {
        // Fibonacci calculation
        const fib = (n) => {
          if (n < 2) return n;
          return fib(n - 1) + fib(n - 2);
        };

        // JSON operations
        const data = {
          items: new Array(1000)
            .fill(null)
            .map((_, i) => ({ id: i, value: Math.random() })),
        };
        const jsonString = JSON.stringify(data);
        const parsed = JSON.parse(jsonString);

        // String operations
        const strings = new Array(100)
          .fill(null)
          .map(() => Math.random().toString(36));
        const combined = strings.join("-");
        const split = combined.split("-");

        return {
          fib20: fib(20),
          jsonSize: jsonString.length,
          parsedItems: parsed.items.length,
          combinedLength: combined.length,
          splitLength: split.length,
        };
      },
      20,
    ); // Fewer iterations for CPU intensive tasks
  }

  /**
   * Run all benchmarks
   */
  async runAllBenchmarks() {
    this.log("🚀 Starting comprehensive benchmark suite...");
    const startTime = performance.now();

    try {
      await this.benchmarkDAGExecution();
      await this.benchmarkConcurrentDAG();
      await this.benchmarkRetryPolicies();
      await this.benchmarkLogging();
      await this.benchmarkMemoryUsage();
      await this.benchmarkCPUIntensive();

      const endTime = performance.now();
      const totalDuration = Math.round(endTime - startTime);

      this.results.meta = {
        totalDuration: totalDuration + "ms",
        totalBenchmarks: Object.keys(this.results.benchmarks).length,
        completedAt: new Date().toISOString(),
      };

      this.log(`✅ All benchmarks completed in ${totalDuration}ms`);

      // Save results
      await this.saveResults();

      // Generate report
      this.generateReport();
    } catch (error) {
      this.logger.error("Benchmark suite failed", { error: error.message });
      throw error;
    } finally {
      this.monitor.shutdown();
    }
  }

  /**
   * Save benchmark results to file
   */
  async saveResults() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `benchmark-${timestamp}.json`;
    const filepath = path.join(this.outputDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(this.results, null, 2));

    // Also save as latest
    const latestPath = path.join(this.outputDir, "latest.json");
    fs.writeFileSync(latestPath, JSON.stringify(this.results, null, 2));

    this.log(`💾 Results saved to: ${filepath}`);
  }

  /**
   * Generate human-readable report
   */
  generateReport() {
    console.log("\n" + "=".repeat(80));
    console.log("🏁 BENCHMARK RESULTS SUMMARY");
    console.log("=".repeat(80));

    console.log(
      `Environment: Node.js ${this.results.environment.nodeVersion} on ${this.results.environment.platform}`,
    );
    console.log(
      `CPUs: ${this.results.environment.cpus}, Memory: ${this.results.environment.totalMemory}`,
    );
    console.log(`Generated: ${this.results.timestamp}\n`);

    // Group benchmarks by category
    const categories = {};
    for (const [name, result] of Object.entries(this.results.benchmarks)) {
      const category = name.split(":")[0] || name.split("(")[0].trim();
      if (!categories[category]) categories[category] = [];
      categories[category].push({ name, ...result });
    }

    for (const [category, benchmarks] of Object.entries(categories)) {
      console.log(`📊 ${category.toUpperCase()}`);
      console.log("-".repeat(60));

      for (const benchmark of benchmarks) {
        console.log(
          `  ${benchmark.name.padEnd(40)} ${benchmark.timing.mean.toString().padStart(8)}ms avg`,
        );
        console.log(
          `    ${"".padEnd(40)} ${benchmark.throughput.toString().padStart(8)} ops/sec`,
        );

        if (benchmark.errors > 0) {
          console.log(
            `    ${"".padEnd(40)} ${benchmark.errors.toString().padStart(8)} errors`,
          );
        }
      }
      console.log("");
    }

    // Performance summary
    const allBenchmarks = Object.values(this.results.benchmarks);
    const avgThroughput =
      allBenchmarks.reduce((sum, b) => sum + b.throughput, 0) /
      allBenchmarks.length;
    const totalErrors = allBenchmarks.reduce((sum, b) => sum + b.errors, 0);

    console.log("📈 PERFORMANCE SUMMARY");
    console.log("-".repeat(60));
    console.log(`Average Throughput: ${Math.round(avgThroughput)} ops/sec`);
    console.log(`Total Errors: ${totalErrors}`);
    console.log(
      `Success Rate: ${Math.round((1 - totalErrors / (allBenchmarks.length * this.iterations)) * 100)}%`,
    );

    console.log("\n" + "=".repeat(80));
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  const options = {
    verbose: args.includes("--verbose") || args.includes("-v"),
    iterations: 100,
    outputDir: path.join(process.cwd(), "benchmark-results"),
  };

  // Parse iterations
  const iterIndex = args.findIndex(
    (arg) => arg === "--iterations" || arg === "-i",
  );
  if (iterIndex !== -1 && args[iterIndex + 1]) {
    options.iterations = parseInt(args[iterIndex + 1], 10);
  }

  // Parse output directory
  const outIndex = args.findIndex((arg) => arg === "--output" || arg === "-o");
  if (outIndex !== -1 && args[outIndex + 1]) {
    options.outputDir = args[outIndex + 1];
  }

  console.log("🔧 RAG Pipeline Utils - Performance Benchmark Suite");
  console.log(
    `Iterations: ${options.iterations}, Output: ${options.outputDir}`,
  );

  const suite = new BenchmarkSuite(options);
  suite.runAllBenchmarks().catch(console.error);
}

module.exports = {
  BenchmarkSuite,
};
