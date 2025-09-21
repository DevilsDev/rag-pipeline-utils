/**
 * Unit tests for benchmark tooling
 * Tests performance measurement and timing utilities
 */

const {
  PipelineBenchmark,
  PerformanceTimer,
} = require("../../../src/core/performance/benchmark.js");

describe("PerformanceTimer", () => {
  let timer;

  beforeEach(() => {
    timer = new PerformanceTimer();
  });

  describe("timing operations", () => {
    it("should start and end timers correctly", () => {
      timer.start("test-operation", { metadata: "test" });

      // Simulate some work - focus on functional correctness, not exact timing
      const iterations = 1000;
      let sum = 0;
      for (let i = 0; i < iterations; i++) {
        sum += i;
      }

      const result = timer.end("test-operation", { success: true });

      expect(result).toHaveProperty("duration");
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.duration).toBeLessThan(5000); // 5s max reasonable upper bound
      expect(result).toHaveProperty("startTime");
      expect(result).toHaveProperty("endTime");
      expect(result).toHaveProperty("memoryDelta");
      expect(result).toHaveProperty("metadata", { metadata: "test" });
      expect(result).toHaveProperty("result", { success: true });
    });

    it("should throw error when ending non-existent timer", () => {
      expect(() => timer.end("nonexistent")).toThrow(
        "Timer 'nonexistent' not found",
      );
    });

    it("should track memory delta", () => {
      timer.start("memory-test");
      const result = timer.end("memory-test");

      expect(result.memoryDelta).toHaveProperty("heapUsed");
      expect(result.memoryDelta).toHaveProperty("heapTotal");
      expect(result.memoryDelta).toHaveProperty("external");
      expect(typeof result.memoryDelta.heapUsed).toBe("number");
    });
  });

  describe("result management", () => {
    it("should store and retrieve results", () => {
      timer.start("test");
      const result = timer.end("test");

      expect(timer.getResult("test")).toBe(result);
    });

    it("should return all results", () => {
      timer.start("test1");
      timer.start("test2");
      timer.end("test1");
      timer.end("test2");

      const allResults = timer.getAllResults();
      expect(allResults.size).toBe(2);
      expect(allResults.has("test1")).toBe(true);
      expect(allResults.has("test2")).toBe(true);
    });

    it("should clear all results", () => {
      timer.start("test");
      timer.end("test");

      expect(timer.getAllResults().size).toBe(1);

      timer.clear();

      expect(timer.getAllResults().size).toBe(0);
      expect(timer.timers.size).toBe(0);
    });
  });
});

describe("PipelineBenchmark", () => {
  let mockPipeline;
  let benchmark;

  beforeEach(() => {
    mockPipeline = {
      loaderInstance: {
        load: jest.fn(),
      },
      embedderInstance: {
        embed: jest.fn(),
      },
      retrieverInstance: {
        store: jest.fn(),
        retrieve: jest.fn(),
      },
      llmInstance: {
        generate: jest.fn(),
      },
      rerankerInstance: null,
    };

    benchmark = new PipelineBenchmark(mockPipeline, {
      iterations: 1,
      warmupRuns: 0,
      includeMemory: true,
    });
  });

  describe("benchmarkIngest", () => {
    beforeEach(() => {
      const mockDocuments = [
        {
          content: "test document content",
          chunk: () => ["chunk1", "chunk2"],
        },
      ];

      mockPipeline.loaderInstance.load.mockResolvedValue(mockDocuments);
      mockPipeline.embedderInstance.embed.mockResolvedValue([
        [1, 2],
        [3, 4],
      ]);
      mockPipeline.retrieverInstance.store.mockResolvedValue();
    });

    it("should benchmark successful ingest operation", async () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      const results = await benchmark.benchmarkIngest("test.txt");

      expect(results.success).toBe(true);
      expect(results.operation).toBe("ingest");
      expect(results.runs.successful).toBe(1);
      expect(results.runs.failed).toBe(0);

      expect(results.timing.stages).toHaveProperty("load");
      expect(results.timing.stages).toHaveProperty("chunk");
      expect(results.timing.stages).toHaveProperty("embed");
      expect(results.timing.stages).toHaveProperty("store");
      expect(results.timing).toHaveProperty("total");

      // Verify all stages have timing stats
      Object.values(results.timing.stages).forEach((stageStats) => {
        expect(stageStats).toHaveProperty("min");
        expect(stageStats).toHaveProperty("max");
        expect(stageStats).toHaveProperty("mean");
        expect(stageStats).toHaveProperty("median");
        expect(stageStats).toHaveProperty("p95");
        expect(stageStats).toHaveProperty("count", 1);
      });

      consoleSpy.mockRestore();
    });

    it("should handle ingest operation failure", async () => {
      mockPipeline.embedderInstance.embed.mockRejectedValue(
        new Error("Embedding failed"),
      );

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      const results = await benchmark.benchmarkIngest("test.txt");

      expect(results.success).toBe(false);
      expect(results.runs.failed).toBe(1);
      expect(results.error).toBe("All benchmark runs failed");

      consoleSpy.mockRestore();
    });

    it("should run multiple iterations", async () => {
      const multiBenchmark = new PipelineBenchmark(mockPipeline, {
        iterations: 3,
        warmupRuns: 0,
      });

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      const results = await multiBenchmark.benchmarkIngest("test.txt");

      expect(results.runs.total).toBe(3);
      expect(results.runs.successful).toBe(3);
      expect(results.timing.total.count).toBe(3);

      consoleSpy.mockRestore();
    });

    it("should run warmup iterations", async () => {
      const warmupBenchmark = new PipelineBenchmark(mockPipeline, {
        iterations: 1,
        warmupRuns: 2,
      });

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await warmupBenchmark.benchmarkIngest("test.txt");

      // Should call load 3 times total (2 warmup + 1 actual)
      expect(mockPipeline.loaderInstance.load).toHaveBeenCalledTimes(3);

      consoleSpy.mockRestore();
    });
  });

  describe("benchmarkQuery", () => {
    beforeEach(() => {
      mockPipeline.embedderInstance.embedQuery = jest
        .fn()
        .mockResolvedValue([1, 2, 3]);
      mockPipeline.retrieverInstance.retrieve.mockResolvedValue([
        { text: "retrieved doc 1" },
        { text: "retrieved doc 2" },
      ]);
      mockPipeline.llmInstance.generate.mockResolvedValue("Generated response");
    });

    it("should benchmark successful query operation", async () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      const results = await benchmark.benchmarkQuery("test query");

      expect(results.success).toBe(true);
      expect(results.operation).toBe("query");
      expect(results.runs.successful).toBe(1);

      expect(results.timing.stages).toHaveProperty("embed");
      expect(results.timing.stages).toHaveProperty("retrieve");
      expect(results.timing.stages).toHaveProperty("generate");
      expect(results.timing.stages).not.toHaveProperty("rerank"); // No reranker

      consoleSpy.mockRestore();
    });

    it("should benchmark query with reranker", async () => {
      mockPipeline.rerankerInstance = {
        rerank: jest.fn().mockResolvedValue([{ text: "reranked doc" }]),
      };

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      const results = await benchmark.benchmarkQuery("test query");

      expect(results.timing.stages).toHaveProperty("rerank");
      expect(mockPipeline.rerankerInstance.rerank).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should handle query operation failure", async () => {
      mockPipeline.llmInstance.generate.mockRejectedValue(
        new Error("LLM failed"),
      );

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      const results = await benchmark.benchmarkQuery("test query");

      expect(results.success).toBe(false);
      expect(results.error).toBe("All benchmark runs failed");

      consoleSpy.mockRestore();
    });
  });

  describe("calculateStats", () => {
    it("should calculate correct statistics", () => {
      const values = [10, 20, 30, 40, 50];
      const stats = benchmark.calculateStats(values);

      expect(stats.min).toBe(10);
      expect(stats.max).toBe(50);
      expect(stats.mean).toBe(30);
      expect(stats.median).toBe(30);
      expect(stats.count).toBe(5);
      expect(stats.stdDev).toBeCloseTo(14.14, 1);
    });

    it("should handle empty array", () => {
      const stats = benchmark.calculateStats([]);
      expect(stats).toBeNull();
    });

    it("should handle single value", () => {
      const stats = benchmark.calculateStats([42]);

      expect(stats.min).toBe(42);
      expect(stats.max).toBe(42);
      expect(stats.mean).toBe(42);
      expect(stats.median).toBe(42);
      expect(stats.stdDev).toBe(0);
    });
  });

  describe("formatResults", () => {
    it("should format successful results", () => {
      const mockResults = {
        success: true,
        operation: "query",
        runs: { successful: 3, total: 3, failed: 0 },
        timing: {
          stages: {
            embed: { mean: 15.5, min: 10, max: 20, p95: 19 },
            retrieve: { mean: 25.2, min: 20, max: 30, p95: 29 },
          },
          total: { mean: 45.7, min: 40, max: 50, p95: 49 },
        },
      };

      const formatted = benchmark.formatResults(mockResults);

      expect(formatted).toContain("QUERY BENCHMARK RESULTS");
      expect(formatted).toContain("Runs: 3/3 successful");
      expect(formatted).toContain("embed");
      expect(formatted).toContain("retrieve");
      expect(formatted).toContain("avg:   15.5");
      expect(formatted).toContain("avg:   45.7");
    });

    it("should format failed results", () => {
      const mockResults = {
        success: false,
        error: "Test error",
      };

      const formatted = benchmark.formatResults(mockResults);

      expect(formatted).toContain("❌ Benchmark failed: Test error");
    });

    it("should show failed runs warning", () => {
      const mockResults = {
        success: true,
        operation: "ingest",
        runs: { successful: 2, total: 3, failed: 1 },
        timing: {
          stages: {
            load: { mean: 10, min: 8, max: 12, p95: 11 },
          },
          total: { mean: 50, min: 45, max: 55, p95: 54 },
        },
      };

      const formatted = benchmark.formatResults(mockResults);

      expect(formatted).toContain("⚠️  1 runs failed");
    });
  });

  describe("aggregateResults", () => {
    it("should aggregate multiple successful runs", () => {
      const runs = [
        {
          success: true,
          stages: {
            test: { duration: 10 },
          },
          total: { duration: 100 },
        },
        {
          success: true,
          stages: {
            test: { duration: 20 },
          },
          total: { duration: 200 },
        },
      ];

      const aggregated = benchmark.aggregateResults("test", runs);

      expect(aggregated.success).toBe(true);
      expect(aggregated.runs.successful).toBe(2);
      expect(aggregated.runs.failed).toBe(0);
      expect(aggregated.timing.stages.test.mean).toBe(15);
      expect(aggregated.timing.total.mean).toBe(150);
    });

    it("should handle all failed runs", () => {
      const runs = [
        { success: false, error: "Error 1" },
        { success: false, error: "Error 2" },
      ];

      const aggregated = benchmark.aggregateResults("test", runs);

      expect(aggregated.success).toBe(false);
      expect(aggregated.error).toBe("All benchmark runs failed");
      expect(aggregated.runs.failed).toBe(2);
      expect(aggregated.runs.total).toBe(2);
    });

    it("should handle mixed success/failure runs", () => {
      const runs = [
        {
          success: true,
          stages: { test: { duration: 10 } },
          total: { duration: 100 },
        },
        { success: false, error: "Error" },
      ];

      const aggregated = benchmark.aggregateResults("test", runs);

      expect(aggregated.success).toBe(true);
      expect(aggregated.runs.successful).toBe(1);
      expect(aggregated.runs.failed).toBe(1);
    });
  });
});
