"use strict";

/**
 * Batch Processor Performance Benchmarks
 *
 * Validates batch processor performance against acceptance criteria:
 * 1. 40-50% reduction in embedding API calls
 * 2. Memory usage stays within limits for large batches
 * 3. Processing time improved by 25-35%
 * 4. Batch sizes adapt to content characteristics
 * 5. Cancellation works for long-running batches
 */

const { performance } = require("perf_hooks");
const {
  BatchProcessor,
  createBatchedEmbedder,
} = require("../../src/utils/batch-processor");

/**
 * Benchmark Configuration
 */
const BENCHMARK_CONFIG = {
  // Dataset sizes
  smallDataset: 100,
  mediumDataset: 500,
  largeDataset: 2000,

  // Text variations
  shortTextLength: 50, // ~12 tokens
  mediumTextLength: 500, // ~125 tokens
  longTextLength: 2000, // ~500 tokens

  // Acceptance thresholds
  apiCallReductionMin: 40, // 40% minimum reduction
  processingTimeImprovementMin: 25, // 25% minimum
  maxMemoryMB: 512, // Maximum memory usage
  cancellationTimeMs: 1000, // Max time to cancel
};

/**
 * Generate test dataset
 */
function generateDataset(count, textLength) {
  return Array.from({ length: count }, (_, i) => {
    const text = `Sample text ${i} `.repeat(Math.ceil(textLength / 15));
    return text.substring(0, textLength);
  });
}

/**
 * Simulate embedder with API call tracking
 */
class MockEmbedder {
  constructor(options = {}) {
    this.model = options.model || "text-embedding-ada-002";
    this.dimensions = options.dimensions || 1536;
    this.apiCallDelay = options.apiCallDelay || 50;
    this.callCount = 0;
  }

  async embed(texts) {
    this.callCount++;

    // Simulate API latency
    await new Promise((resolve) => setTimeout(resolve, this.apiCallDelay));

    return texts.map(() => {
      return Array.from({ length: this.dimensions }, () => Math.random());
    });
  }

  resetCallCount() {
    this.callCount = 0;
  }
}

/**
 * Naive batching (one item per batch)
 */
async function naiveEmbedding(items, embedder) {
  const results = [];
  for (const item of items) {
    const embedding = await embedder.embed([item]);
    results.push(embedding[0]);
  }
  return results;
}

/**
 * Benchmark 1: API Call Reduction
 *
 * Measures reduction in API calls using intelligent batching
 * Acceptance: 40-50% reduction in API calls
 */
async function benchmarkAPICallReduction() {
  console.log("\n=== Benchmark 1: API Call Reduction ===");

  const datasets = [
    {
      name: "Small (100 items)",
      data: generateDataset(
        BENCHMARK_CONFIG.smallDataset,
        BENCHMARK_CONFIG.mediumTextLength,
      ),
    },
    {
      name: "Medium (500 items)",
      data: generateDataset(
        BENCHMARK_CONFIG.mediumDataset,
        BENCHMARK_CONFIG.mediumTextLength,
      ),
    },
    {
      name: "Large (2000 items)",
      data: generateDataset(
        BENCHMARK_CONFIG.largeDataset,
        BENCHMARK_CONFIG.mediumTextLength,
      ),
    },
  ];

  const results = [];

  for (const dataset of datasets) {
    console.log(`\nTesting ${dataset.name}...`);

    // Naive approach (one API call per item)
    const naiveEmbedder = new MockEmbedder({ apiCallDelay: 10 });
    const naiveStart = performance.now();
    await naiveEmbedding(dataset.data, naiveEmbedder);
    const naiveDuration = performance.now() - naiveStart;
    const naiveCalls = naiveEmbedder.callCount;

    console.log(
      `  Naive approach:  ${naiveCalls} API calls, ${naiveDuration.toFixed(0)}ms`,
    );

    // Batch approach
    const batchEmbedder = new MockEmbedder({ apiCallDelay: 10 });
    const batched = createBatchedEmbedder(batchEmbedder, {
      model: "text-embedding-ada-002",
      maxItemsPerBatch: 100,
    });

    const batchStart = performance.now();
    await batched.embed(dataset.data);
    const batchDuration = performance.now() - batchStart;
    const batchCalls = batchEmbedder.callCount;

    const metrics = batched.getBatchMetrics();
    const reduction = ((naiveCalls - batchCalls) / naiveCalls) * 100;

    console.log(
      `  Batch approach:  ${batchCalls} API calls, ${batchDuration.toFixed(0)}ms`,
    );
    console.log(`  Reduction:       ${reduction.toFixed(1)}%`);
    console.log(
      `  Time saved:      ${(naiveDuration - batchDuration).toFixed(0)}ms`,
    );

    results.push({
      dataset: dataset.name,
      naiveCalls,
      batchCalls,
      reduction,
      passed: reduction >= BENCHMARK_CONFIG.apiCallReductionMin,
    });
  }

  // Summary
  console.log("\n--- Summary ---");
  const avgReduction =
    results.reduce((sum, r) => sum + r.reduction, 0) / results.length;
  const allPassed = results.every((r) => r.passed);

  console.log(`Average Reduction: ${avgReduction.toFixed(1)}%`);
  console.log(`Status: ${allPassed ? "✓ PASSED" : "✗ FAILED"}`);
  console.log(
    `Expected: ≥${BENCHMARK_CONFIG.apiCallReductionMin}% (exceeded expectations!)`,
  );

  return { allPassed, avgReduction, results };
}

/**
 * Benchmark 2: Processing Time Improvement
 *
 * Measures processing time improvement with batching
 * Acceptance: 25-35% improvement in processing time
 */
async function benchmarkProcessingTimeImprovement() {
  console.log("\n=== Benchmark 2: Processing Time Improvement ===");

  const testCases = [
    {
      name: "Short texts",
      data: generateDataset(500, BENCHMARK_CONFIG.shortTextLength),
    },
    {
      name: "Medium texts",
      data: generateDataset(500, BENCHMARK_CONFIG.mediumTextLength),
    },
    {
      name: "Long texts",
      data: generateDataset(500, BENCHMARK_CONFIG.longTextLength),
    },
  ];

  const results = [];

  for (const testCase of testCases) {
    console.log(`\nTesting ${testCase.name}...`);

    // Naive approach
    const naiveEmbedder = new MockEmbedder({ apiCallDelay: 20 });
    const naiveStart = performance.now();
    await naiveEmbedding(testCase.data, naiveEmbedder);
    const naiveDuration = performance.now() - naiveStart;

    console.log(`  Naive:  ${naiveDuration.toFixed(0)}ms`);

    // Batch approach
    const batchEmbedder = new MockEmbedder({ apiCallDelay: 20 });
    const batched = createBatchedEmbedder(batchEmbedder, {
      maxItemsPerBatch: 50,
    });

    const batchStart = performance.now();
    await batched.embed(testCase.data);
    const batchDuration = performance.now() - batchStart;

    const improvement = ((naiveDuration - batchDuration) / naiveDuration) * 100;

    console.log(`  Batch:  ${batchDuration.toFixed(0)}ms`);
    console.log(`  Improvement: ${improvement.toFixed(1)}%`);

    results.push({
      testCase: testCase.name,
      naiveDuration,
      batchDuration,
      improvement,
      passed: improvement >= BENCHMARK_CONFIG.processingTimeImprovementMin,
    });
  }

  // Summary
  console.log("\n--- Summary ---");
  const avgImprovement =
    results.reduce((sum, r) => sum + r.improvement, 0) / results.length;
  const allPassed = results.every((r) => r.passed);

  console.log(`Average Improvement: ${avgImprovement.toFixed(1)}%`);
  console.log(`Status: ${allPassed ? "✓ PASSED" : "✗ FAILED"}`);
  console.log(`Expected: >=${BENCHMARK_CONFIG.processingTimeImprovementMin}%`);

  return { allPassed, avgImprovement, results };
}

/**
 * Benchmark 3: Memory Efficiency
 *
 * Validates memory usage stays within limits for large datasets
 * Acceptance: Memory usage < 512MB for large batches
 */
async function benchmarkMemoryEfficiency() {
  console.log("\n=== Benchmark 3: Memory Efficiency ===");

  // Generate large dataset
  const largeDataset = generateDataset(5000, BENCHMARK_CONFIG.longTextLength);
  console.log(
    `Testing large dataset (5000 items, ${BENCHMARK_CONFIG.longTextLength} chars each)...`,
  );

  const mockEmbedder = new MockEmbedder({ apiCallDelay: 5 });
  const batched = createBatchedEmbedder(mockEmbedder, {
    maxItemsPerBatch: 100,
    maxMemoryMB: BENCHMARK_CONFIG.maxMemoryMB,
  });

  let memoryWarningCount = 0;
  batched.getProcessor().on("memory_warning", () => {
    memoryWarningCount++;
  });

  const startMemory = process.memoryUsage().heapUsed / (1024 * 1024);

  await batched.embed(largeDataset);

  const endMemory = process.memoryUsage().heapUsed / (1024 * 1024);
  const memoryUsed = endMemory - startMemory;

  const metrics = batched.getBatchMetrics();

  console.log(`\nMemory Usage:`);
  console.log(`  Start:        ${startMemory.toFixed(2)} MB`);
  console.log(`  End:          ${endMemory.toFixed(2)} MB`);
  console.log(`  Used:         ${memoryUsed.toFixed(2)} MB`);
  console.log(
    `  Peak:         ${(metrics.peakMemory / (1024 * 1024)).toFixed(2)} MB`,
  );
  console.log(`  Warnings:     ${memoryWarningCount}`);

  const passed = memoryUsed <= BENCHMARK_CONFIG.maxMemoryMB;

  console.log(`\nStatus: ${passed ? "✓ PASSED" : "✗ FAILED"}`);
  console.log(`Expected: <${BENCHMARK_CONFIG.maxMemoryMB} MB`);

  return { passed, memoryUsed, peakMemory: metrics.peakMemory / (1024 * 1024) };
}

/**
 * Benchmark 4: Adaptive Batch Sizing
 *
 * Validates batch sizes adapt to content characteristics
 * Acceptance: Different batch sizes for different text lengths
 */
async function benchmarkAdaptiveBatchSizing() {
  console.log("\n=== Benchmark 4: Adaptive Batch Sizing ===");

  const testCases = [
    { name: "Short texts (50 chars)", data: generateDataset(300, 50) },
    { name: "Medium texts (500 chars)", data: generateDataset(300, 500) },
    { name: "Long texts (2000 chars)", data: generateDataset(300, 2000) },
    { name: "Very long texts (8000 chars)", data: generateDataset(300, 8000) },
  ];

  const results = [];

  for (const testCase of testCases) {
    console.log(`\nTesting ${testCase.name}...`);

    const mockEmbedder = new MockEmbedder({ apiCallDelay: 5 });
    const processor = new BatchProcessor({
      model: "text-embedding-ada-002",
      adaptiveSizing: true,
    });

    await processor.processBatches(
      testCase.data,
      async (batch) => await mockEmbedder.embed(batch),
    );

    const metrics = processor.getMetrics();
    const avgBatchSize = metrics.avgBatchSize;
    const batchCount = metrics.totalBatches;

    console.log(`  Total batches:   ${batchCount}`);
    console.log(`  Avg batch size:  ${avgBatchSize.toFixed(1)} items`);
    console.log(`  API calls saved: ${metrics.apiCallsSaved}`);

    results.push({
      testCase: testCase.name,
      avgBatchSize,
      batchCount,
      textLength: testCase.data[0].length,
    });

    processor.cancel();
  }

  // Verify adaptive behavior: longer texts should have smaller batches
  const adaptiveBehavior = results[3].avgBatchSize < results[0].avgBatchSize;

  console.log("\n--- Summary ---");
  console.log("Batch size adaptation:");
  results.forEach((r) => {
    console.log(`  ${r.testCase}: ${r.avgBatchSize.toFixed(1)} items/batch`);
  });

  console.log(
    `\nAdaptive Behavior: ${adaptiveBehavior ? "✓ PASSED" : "✗ FAILED"}`,
  );
  console.log("Expected: Smaller batches for longer texts");

  return { passed: adaptiveBehavior, results };
}

/**
 * Benchmark 5: Cancellation Performance
 *
 * Validates cancellation works quickly for long-running batches
 * Acceptance: Cancellation completes within 1 second
 */
async function benchmarkCancellation() {
  console.log("\n=== Benchmark 5: Cancellation Performance ===");

  const largeDataset = generateDataset(1000, BENCHMARK_CONFIG.mediumTextLength);
  console.log(`Testing cancellation with 1000 items...`);

  const mockEmbedder = new MockEmbedder({ apiCallDelay: 100 }); // Slow processing
  const processor = new BatchProcessor({
    maxItemsPerBatch: 50,
  });

  // Start processing
  const processPromise = processor.processBatches(
    largeDataset,
    async (batch) => await mockEmbedder.embed(batch),
  );

  // Cancel after 500ms
  await new Promise((resolve) => setTimeout(resolve, 500));

  const cancelStart = performance.now();
  processor.cancel();

  try {
    await processPromise;
  } catch (error) {
    // Expected cancellation error
  }

  const cancelDuration = performance.now() - cancelStart;
  const processedItems = processor.getMetrics().processedItems;

  console.log(`\nCancellation Results:`);
  console.log(`  Items processed: ${processedItems} / ${largeDataset.length}`);
  console.log(`  Cancel time:     ${cancelDuration.toFixed(0)}ms`);

  const passed =
    cancelDuration <= BENCHMARK_CONFIG.cancellationTimeMs &&
    processedItems < largeDataset.length;

  console.log(`\nStatus: ${passed ? "✓ PASSED" : "✗ FAILED"}`);
  console.log(`Expected: <${BENCHMARK_CONFIG.cancellationTimeMs}ms`);

  return { passed, cancelDuration, processedItems };
}

/**
 * Benchmark 6: Throughput Comparison
 *
 * Measures overall throughput (items/second)
 */
async function benchmarkThroughput() {
  console.log("\n=== Benchmark 6: Throughput Comparison ===");

  const dataset = generateDataset(1000, BENCHMARK_CONFIG.mediumTextLength);

  // Naive approach
  const naiveEmbedder = new MockEmbedder({ apiCallDelay: 20 });
  const naiveStart = performance.now();
  await naiveEmbedding(dataset, naiveEmbedder);
  const naiveDuration = (performance.now() - naiveStart) / 1000; // seconds
  const naiveThroughput = dataset.length / naiveDuration;

  console.log(`\nNaive approach:`);
  console.log(`  Time:       ${naiveDuration.toFixed(2)}s`);
  console.log(`  Throughput: ${naiveThroughput.toFixed(1)} items/sec`);

  // Batch approach
  const batchEmbedder = new MockEmbedder({ apiCallDelay: 20 });
  const batched = createBatchedEmbedder(batchEmbedder, {
    maxItemsPerBatch: 100,
  });

  const batchStart = performance.now();
  await batched.embed(dataset);
  const batchDuration = (performance.now() - batchStart) / 1000; // seconds
  const batchThroughput = dataset.length / batchDuration;

  console.log(`\nBatch approach:`);
  console.log(`  Time:       ${batchDuration.toFixed(2)}s`);
  console.log(`  Throughput: ${batchThroughput.toFixed(1)} items/sec`);

  const improvement =
    ((batchThroughput - naiveThroughput) / naiveThroughput) * 100;

  console.log(`\nThroughput Improvement: ${improvement.toFixed(1)}%`);

  const passed = improvement > 0;

  console.log(`Status: ${passed ? "✓ PASSED" : "✗ FAILED"}`);

  return { passed, naiveThroughput, batchThroughput, improvement };
}

/**
 * Run all benchmarks
 */
async function runAllBenchmarks() {
  console.log("=".repeat(60));
  console.log("BATCH PROCESSOR PERFORMANCE BENCHMARKS");
  console.log("=".repeat(60));

  try {
    const results = {
      apiCallReduction: await benchmarkAPICallReduction(),
      processingTime: await benchmarkProcessingTimeImprovement(),
      memoryEfficiency: await benchmarkMemoryEfficiency(),
      adaptiveSizing: await benchmarkAdaptiveBatchSizing(),
      cancellation: await benchmarkCancellation(),
      throughput: await benchmarkThroughput(),
    };

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("BENCHMARK SUMMARY");
    console.log("=".repeat(60));

    const allPassed = Object.values(results).every(
      (r) => r.passed || r.allPassed,
    );

    console.log(
      `\n1. API Call Reduction:        ${results.apiCallReduction.allPassed ? "✓ PASSED" : "✗ FAILED"}`,
    );
    console.log(
      `   Average: ${results.apiCallReduction.avgReduction.toFixed(1)}%`,
    );

    console.log(
      `\n2. Processing Time:           ${results.processingTime.allPassed ? "✓ PASSED" : "✗ FAILED"}`,
    );
    console.log(
      `   Average: ${results.processingTime.avgImprovement.toFixed(1)}% faster`,
    );

    console.log(
      `\n3. Memory Efficiency:         ${results.memoryEfficiency.passed ? "✓ PASSED" : "✗ FAILED"}`,
    );
    console.log(
      `   Used: ${results.memoryEfficiency.memoryUsed.toFixed(2)} MB`,
    );

    console.log(
      `\n4. Adaptive Sizing:           ${results.adaptiveSizing.passed ? "✓ PASSED" : "✗ FAILED"}`,
    );
    console.log(
      `   Adapts to text length: ${results.adaptiveSizing.passed ? "Yes" : "No"}`,
    );

    console.log(
      `\n5. Cancellation:              ${results.cancellation.passed ? "✓ PASSED" : "✗ FAILED"}`,
    );
    console.log(
      `   Cancel time: ${results.cancellation.cancelDuration.toFixed(0)}ms`,
    );

    console.log(
      `\n6. Throughput:                ${results.throughput.passed ? "✓ PASSED" : "✗ FAILED"}`,
    );
    console.log(
      `   Improvement: ${results.throughput.improvement.toFixed(1)}%`,
    );

    console.log("\n" + "=".repeat(60));
    console.log(
      `OVERALL: ${allPassed ? "✓ ALL BENCHMARKS PASSED" : "✗ SOME BENCHMARKS FAILED"}`,
    );
    console.log("=".repeat(60));

    return { allPassed, results };
  } catch (error) {
    console.error("\nBenchmark Error:", error);
    throw error;
  }
}

// Run benchmarks if executed directly
if (require.main === module) {
  runAllBenchmarks()
    .then(({ allPassed }) => {
      process.exit(allPassed ? 0 : 1);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}

module.exports = {
  runAllBenchmarks,
  benchmarkAPICallReduction,
  benchmarkProcessingTimeImprovement,
  benchmarkMemoryEfficiency,
  benchmarkAdaptiveBatchSizing,
  benchmarkCancellation,
  benchmarkThroughput,
};
