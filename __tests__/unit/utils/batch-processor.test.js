"use strict";

/**
 * Batch Processor Tests
 *
 * Tests for intelligent batch processing with dynamic sizing,
 * progress tracking, and cancellation support.
 */

const {
  BatchProcessor,
  createBatchedEmbedder,
  DEFAULT_CONFIG,
  MODEL_LIMITS,
} = require("../../../src/utils/batch-processor");

describe("BatchProcessor", () => {
  let processor;

  beforeEach(() => {
    processor = new BatchProcessor();
  });

  afterEach(() => {
    if (processor) {
      processor.cancel();
      processor.removeAllListeners();
    }
  });

  describe("Initialization", () => {
    test("should create processor with default config", () => {
      expect(processor).toBeDefined();
      expect(processor.config).toMatchObject({
        maxTokensPerBatch: 8191,
        maxItemsPerBatch: 2048,
        adaptiveSizing: true,
      });
    });

    test("should create processor with custom config", () => {
      const custom = new BatchProcessor({
        maxTokensPerBatch: 4000,
        maxItemsPerBatch: 100,
        adaptiveSizing: false,
      });

      expect(custom.config.maxTokensPerBatch).toBe(4000);
      expect(custom.config.maxItemsPerBatch).toBe(100);
      expect(custom.config.adaptiveSizing).toBe(false);

      custom.cancel();
    });

    test("should apply model-specific limits", () => {
      const openai = new BatchProcessor({ model: "text-embedding-ada-002" });
      expect(openai.config.maxTokensPerBatch).toBe(8191);
      expect(openai.config.maxItemsPerBatch).toBe(2048);

      const voyage = new BatchProcessor({ model: "voyage-large-2" });
      expect(voyage.config.maxTokensPerBatch).toBe(16000);
      expect(voyage.config.maxItemsPerBatch).toBe(128);

      openai.cancel();
      voyage.cancel();
    });

    test("should initialize metrics to zero", () => {
      const metrics = processor.getMetrics();
      expect(metrics.totalItems).toBe(0);
      expect(metrics.processedItems).toBe(0);
      expect(metrics.totalBatches).toBe(0);
      expect(metrics.apiCallsSaved).toBe(0);
    });
  });

  describe("Basic Batch Processing", () => {
    test("should process single batch", async () => {
      const items = ["text1", "text2", "text3"];
      const mockProcess = jest.fn(async (batch) =>
        batch.map((t) => ({ embedding: [1, 2, 3] })),
      );

      const results = await processor.processBatches(items, mockProcess);

      expect(results).toHaveLength(3);
      expect(mockProcess).toHaveBeenCalledTimes(1);
    });

    test("should process multiple batches", async () => {
      // Create items that exceed one batch
      const items = Array.from({ length: 300 }, (_, i) => `text-${i}`);
      const mockProcess = jest.fn(async (batch) =>
        batch.map(() => ({ embedding: [1, 2, 3] })),
      );

      processor = new BatchProcessor({
        maxItemsPerBatch: 100,
        maxTokensPerBatch: 1000,
      });

      const results = await processor.processBatches(items, mockProcess);

      expect(results).toHaveLength(300);
      expect(mockProcess).toHaveBeenCalled();
      expect(mockProcess.mock.calls.length).toBeGreaterThan(1);
    });

    test("should handle string items", async () => {
      const items = ["hello world", "test text", "another item"];
      const mockProcess = jest.fn(async (batch) => batch.map((t) => [1, 2, 3]));

      const results = await processor.processBatches(items, mockProcess);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual([1, 2, 3]);
    });

    test("should handle object items", async () => {
      const items = [
        { id: 1, text: "hello" },
        { id: 2, text: "world" },
        { id: 3, content: "test" },
      ];
      const mockProcess = jest.fn(async (batch) => batch.map(() => [1, 2, 3]));

      const results = await processor.processBatches(items, mockProcess);

      expect(results).toHaveLength(3);
    });
  });

  describe("Dynamic Batch Sizing", () => {
    test("should create batches based on token limits", async () => {
      // Create long texts that exceed token limits
      const longText = "a".repeat(10000); // ~2500 tokens
      const items = Array.from({ length: 10 }, () => longText);

      processor = new BatchProcessor({
        maxTokensPerBatch: 8000,
        maxItemsPerBatch: 100,
      });

      const mockProcess = jest.fn(async (batch) => batch.map(() => [1, 2, 3]));

      await processor.processBatches(items, mockProcess);

      const metrics = processor.getMetrics();

      // Should create more batches due to token limit
      expect(metrics.totalBatches).toBeGreaterThan(1);
      expect(mockProcess.mock.calls.length).toBeGreaterThan(1);
    });

    test("should create batches based on item limits", async () => {
      const items = Array.from({ length: 250 }, (_, i) => `item-${i}`);

      processor = new BatchProcessor({
        maxItemsPerBatch: 100,
      });

      const mockProcess = jest.fn(async (batch) => batch.map(() => [1, 2, 3]));

      await processor.processBatches(items, mockProcess);

      const metrics = processor.getMetrics();
      expect(metrics.totalBatches).toBeGreaterThanOrEqual(3);
    });

    test("should respect target batch utilization", () => {
      processor = new BatchProcessor({
        maxTokensPerBatch: 8191,
        targetBatchUtilization: 0.85,
      });

      const effectiveLimit =
        processor.config.maxTokensPerBatch *
        processor.config.targetBatchUtilization;
      expect(effectiveLimit).toBeCloseTo(8191 * 0.85, 0);
    });
  });

  describe("Progress Tracking", () => {
    test("should emit start event", async () => {
      const items = ["test1", "test2"];
      const mockProcess = jest.fn(async (batch) => batch.map(() => [1, 2, 3]));

      const startSpy = jest.fn();
      processor.on("start", startSpy);

      await processor.processBatches(items, mockProcess);

      expect(startSpy).toHaveBeenCalledWith({
        totalItems: 2,
        estimatedBatches: expect.any(Number),
      });
    });

    test("should emit progress events", async () => {
      const items = Array.from({ length: 100 }, (_, i) => `item-${i}`);
      const mockProcess = jest.fn(async (batch) => batch.map(() => [1, 2, 3]));

      processor = new BatchProcessor({
        maxItemsPerBatch: 25,
      });

      const progressSpy = jest.fn();
      processor.on("progress", progressSpy);

      await processor.processBatches(items, mockProcess);

      expect(progressSpy).toHaveBeenCalled();
      expect(progressSpy.mock.calls.length).toBeGreaterThan(0);

      const lastCall =
        progressSpy.mock.calls[progressSpy.mock.calls.length - 1][0];
      expect(lastCall.processed).toBe(100);
      expect(lastCall.percentage).toBe(100);
    });

    test("should call onProgress callback", async () => {
      const items = Array.from({ length: 50 }, (_, i) => `item-${i}`);
      const mockProcess = jest.fn(async (batch) => batch.map(() => [1, 2, 3]));
      const onProgress = jest.fn();

      processor = new BatchProcessor({
        maxItemsPerBatch: 10,
      });

      await processor.processBatches(items, mockProcess, { onProgress });

      expect(onProgress).toHaveBeenCalled();
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          processed: expect.any(Number),
          total: 50,
          percentage: expect.any(Number),
        }),
      );
    });

    test("should emit batch_complete events", async () => {
      const items = ["test1", "test2"];
      const mockProcess = jest.fn(async (batch) => batch.map(() => [1, 2, 3]));

      const batchCompleteSpy = jest.fn();
      processor.on("batch_complete", batchCompleteSpy);

      await processor.processBatches(items, mockProcess);

      expect(batchCompleteSpy).toHaveBeenCalled();
      expect(batchCompleteSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          batchIndex: expect.any(Number),
          batchSize: expect.any(Number),
          duration: expect.any(Number),
        }),
      );
    });

    test("should emit complete event", async () => {
      const items = ["test1", "test2"];
      const mockProcess = jest.fn(async (batch) => batch.map(() => [1, 2, 3]));

      const completeSpy = jest.fn();
      processor.on("complete", completeSpy);

      await processor.processBatches(items, mockProcess);

      expect(completeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          totalItems: 2,
          totalBatches: expect.any(Number),
          totalTime: expect.any(Number),
        }),
      );
    });
  });

  describe("Cancellation", () => {
    test("should cancel processing", async () => {
      const items = Array.from({ length: 1000 }, (_, i) => `item-${i}`);
      const mockProcess = jest.fn(async (batch) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return batch.map(() => [1, 2, 3]);
      });

      processor = new BatchProcessor({
        maxItemsPerBatch: 10,
      });

      // Start processing
      const processPromise = processor.processBatches(items, mockProcess);

      // Cancel after short delay
      setTimeout(() => {
        processor.cancel();
      }, 100);

      await expect(processPromise).rejects.toThrow("Processing cancelled");

      const metrics = processor.getMetrics();
      expect(metrics.processedItems).toBeLessThan(items.length);
    });

    test("should emit cancelled event", async () => {
      const items = Array.from({ length: 100 }, (_, i) => `item-${i}`);
      const mockProcess = jest.fn(async (batch) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return batch.map(() => [1, 2, 3]);
      });

      processor = new BatchProcessor({
        maxItemsPerBatch: 10,
      });

      const cancelledSpy = jest.fn();
      processor.on("cancelled", cancelledSpy);

      const processPromise = processor.processBatches(items, mockProcess);

      setTimeout(() => {
        processor.cancel();
      }, 50);

      await expect(processPromise).rejects.toThrow();
      expect(cancelledSpy).toHaveBeenCalled();
    });

    test("should support AbortController", async () => {
      const items = Array.from({ length: 100 }, (_, i) => `item-${i}`);
      const mockProcess = jest.fn(async (batch) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return batch.map(() => [1, 2, 3]);
      });

      processor = new BatchProcessor({
        maxItemsPerBatch: 10,
      });

      const abortController = new AbortController();
      const processPromise = processor.processBatches(items, mockProcess, {
        abortController,
      });

      setTimeout(() => {
        abortController.abort();
      }, 50);

      await expect(processPromise).rejects.toThrow();
    });
  });

  describe("Error Handling and Retry", () => {
    test("should retry failed batches", async () => {
      const items = ["test1", "test2"];
      let attemptCount = 0;

      const mockProcess = jest.fn(async (batch) => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error("Temporary failure");
        }
        return batch.map(() => [1, 2, 3]);
      });

      processor = new BatchProcessor({
        maxRetries: 3,
        retryDelay: 10,
      });

      const results = await processor.processBatches(items, mockProcess);

      expect(results).toHaveLength(2);
      expect(attemptCount).toBe(2); // Initial attempt + 1 retry
    });

    test("should emit batch_retry events", async () => {
      const items = ["test1"];
      let attemptCount = 0;

      const mockProcess = jest.fn(async (batch) => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error("Temporary failure");
        }
        return batch.map(() => [1, 2, 3]);
      });

      processor = new BatchProcessor({
        maxRetries: 3,
        retryDelay: 10,
      });

      const retrySpy = jest.fn();
      processor.on("batch_retry", retrySpy);

      await processor.processBatches(items, mockProcess);

      expect(retrySpy).toHaveBeenCalled();
      expect(retrySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          batchIndex: expect.any(Number),
          retryCount: expect.any(Number),
          maxRetries: 3,
        }),
      );
    });

    test("should fail after max retries", async () => {
      const items = ["test1"];
      const mockProcess = jest.fn(async () => {
        throw new Error("Persistent failure");
      });

      processor = new BatchProcessor({
        maxRetries: 2,
        retryDelay: 10,
      });

      await expect(
        processor.processBatches(items, mockProcess),
      ).rejects.toThrow("failed after 2 retries");

      const metrics = processor.getMetrics();
      expect(metrics.failedBatches).toBe(1);
    });

    test("should emit error event on failure", async () => {
      const items = ["test1"];
      const mockProcess = jest.fn(async () => {
        throw new Error("Test error");
      });

      processor = new BatchProcessor({
        maxRetries: 1,
        retryDelay: 10,
      });

      const errorSpy = jest.fn();
      processor.on("error", errorSpy);

      await expect(
        processor.processBatches(items, mockProcess),
      ).rejects.toThrow();

      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe("Metrics and Performance", () => {
    test("should track total items and batches", async () => {
      const items = Array.from({ length: 150 }, (_, i) => `item-${i}`);
      const mockProcess = jest.fn(async (batch) => batch.map(() => [1, 2, 3]));

      processor = new BatchProcessor({
        maxItemsPerBatch: 50,
      });

      await processor.processBatches(items, mockProcess);

      const metrics = processor.getMetrics();
      expect(metrics.totalItems).toBe(150);
      expect(metrics.processedItems).toBe(150);
      expect(metrics.totalBatches).toBe(3);
    });

    test("should calculate API calls saved", async () => {
      const items = Array.from({ length: 100 }, (_, i) => `item-${i}`);
      const mockProcess = jest.fn(async (batch) => batch.map(() => [1, 2, 3]));

      processor = new BatchProcessor({
        maxItemsPerBatch: 50,
      });

      await processor.processBatches(items, mockProcess);

      const metrics = processor.getMetrics();

      // Should save 98 API calls (100 items - 2 batches = 98 saved)
      expect(metrics.apiCallsSaved).toBe(98);
      expect(metrics.efficiency.apiCallReduction).toBeCloseTo(98, 0);
    });

    test("should track processing time", async () => {
      const items = ["test1", "test2"];
      const mockProcess = jest.fn(async (batch) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return batch.map(() => [1, 2, 3]);
      });

      await processor.processBatches(items, mockProcess);

      const metrics = processor.getMetrics();
      expect(metrics.totalTime).toBeGreaterThanOrEqual(0);
      expect(metrics.efficiency.throughput).toBeGreaterThanOrEqual(0);
    });

    test("should track average batch size", async () => {
      const items = Array.from({ length: 100 }, (_, i) => `item-${i}`);
      const mockProcess = jest.fn(async (batch) => batch.map(() => [1, 2, 3]));

      processor = new BatchProcessor({
        maxItemsPerBatch: 25,
      });

      await processor.processBatches(items, mockProcess);

      const metrics = processor.getMetrics();
      expect(metrics.avgBatchSize).toBe(25);
    });

    test("should reset metrics", async () => {
      const items = ["test1", "test2"];
      const mockProcess = jest.fn(async (batch) => batch.map(() => [1, 2, 3]));

      await processor.processBatches(items, mockProcess);

      processor.resetMetrics();

      const metrics = processor.getMetrics();
      expect(metrics.totalItems).toBe(0);
      expect(metrics.processedItems).toBe(0);
      expect(metrics.totalBatches).toBe(0);
    });
  });

  describe("Memory Management", () => {
    test("should track memory usage", async () => {
      const largeText = "x".repeat(10000);
      const items = Array.from({ length: 10 }, () => largeText);
      const mockProcess = jest.fn(async (batch) => batch.map(() => [1, 2, 3]));

      await processor.processBatches(items, mockProcess);

      const metrics = processor.getMetrics();
      expect(metrics.memoryUsed).toBeGreaterThan(0);
      expect(metrics.peakMemory).toBeGreaterThan(0);
    });

    test("should emit memory warning when threshold exceeded", async () => {
      const largeText = "x".repeat(100000);
      const items = Array.from({ length: 100 }, () => largeText);
      const mockProcess = jest.fn(async (batch) => batch.map(() => [1, 2, 3]));

      processor = new BatchProcessor({
        maxMemoryMB: 1, // Very low threshold
        maxItemsPerBatch: 10,
      });

      const memorySpy = jest.fn();
      processor.on("memory_warning", memorySpy);

      await processor.processBatches(items, mockProcess);

      expect(memorySpy).toHaveBeenCalled();
    });
  });

  describe("Adaptive Sizing", () => {
    test("should learn optimal batch size", async () => {
      const items = Array.from({ length: 200 }, (_, i) => `item-${i}`);
      const mockProcess = jest.fn(async (batch) => {
        // Simulate variable processing time
        await new Promise((resolve) => setTimeout(resolve, batch.length * 2));
        return batch.map(() => [1, 2, 3]);
      });

      processor = new BatchProcessor({
        adaptiveSizing: true,
        maxItemsPerBatch: 100,
      });

      await processor.processBatches(items, mockProcess);

      // Should have learned something
      expect(processor.adaptiveState.recentBatchSizes.length).toBeGreaterThan(
        0,
      );
    });

    test("should disable adaptive sizing when configured", async () => {
      const items = Array.from({ length: 50 }, (_, i) => `item-${i}`);
      const mockProcess = jest.fn(async (batch) => batch.map(() => [1, 2, 3]));

      processor = new BatchProcessor({
        adaptiveSizing: false,
      });

      await processor.processBatches(items, mockProcess);

      expect(processor.adaptiveState.optimalBatchSize).toBeNull();
    });
  });

  describe("Status and State", () => {
    test("should report processing status", async () => {
      const items = Array.from({ length: 100 }, (_, i) => `item-${i}`);
      const mockProcess = jest.fn(async (batch) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return batch.map(() => [1, 2, 3]);
      });

      processor = new BatchProcessor({
        maxItemsPerBatch: 20,
      });

      const processPromise = processor.processBatches(items, mockProcess);

      // Check status while processing
      await new Promise((resolve) => setTimeout(resolve, 100));
      const status = processor.getStatus();

      expect(status.processing).toBe(true);
      expect(status.progress).toBeGreaterThan(0);
      expect(status.progress).toBeLessThanOrEqual(100);

      await processPromise;

      const finalStatus = processor.getStatus();
      expect(finalStatus.progress).toBe(100);
    });
  });

  describe("Input Validation", () => {
    test("should throw on empty items array", async () => {
      const mockProcess = jest.fn();

      await expect(processor.processBatches([], mockProcess)).rejects.toThrow(
        "non-empty array",
      );
    });

    test("should throw on non-array items", async () => {
      const mockProcess = jest.fn();

      await expect(
        processor.processBatches("not an array", mockProcess),
      ).rejects.toThrow("non-empty array");
    });

    test("should throw on invalid processFn", async () => {
      await expect(
        processor.processBatches(["test"], "not a function"),
      ).rejects.toThrow("must be a function");
    });
  });
});

describe("createBatchedEmbedder", () => {
  test("should wrap embedder with batch processing", async () => {
    const mockEmbedder = {
      model: "text-embedding-ada-002",
      embed: jest.fn(async (texts) => texts.map(() => [1, 2, 3])),
    };

    const batched = createBatchedEmbedder(mockEmbedder, {
      maxItemsPerBatch: 50,
    });

    const items = Array.from({ length: 100 }, (_, i) => `item-${i}`);
    const results = await batched.embed(items);

    expect(results).toHaveLength(100);
    expect(mockEmbedder.embed).toHaveBeenCalled();
  });

  test("should provide access to processor", () => {
    const mockEmbedder = {
      embed: jest.fn(async (texts) => texts.map(() => [1, 2, 3])),
    };

    const batched = createBatchedEmbedder(mockEmbedder);
    const processor = batched.getProcessor();

    expect(processor).toBeInstanceOf(BatchProcessor);
  });

  test("should provide batch metrics", async () => {
    const mockEmbedder = {
      embed: jest.fn(async (texts) => texts.map(() => [1, 2, 3])),
    };

    const batched = createBatchedEmbedder(mockEmbedder, {
      maxItemsPerBatch: 10,
    });

    await batched.embed(["test1", "test2"]);

    const metrics = batched.getBatchMetrics();
    expect(metrics.totalItems).toBe(2);
  });

  test("should pass through progress callback", async () => {
    const mockEmbedder = {
      embed: jest.fn(async (texts) => texts.map(() => [1, 2, 3])),
    };

    const batched = createBatchedEmbedder(mockEmbedder, {
      maxItemsPerBatch: 10,
    });

    const onProgress = jest.fn();
    const items = Array.from({ length: 50 }, (_, i) => `item-${i}`);

    await batched.embed(items, { onProgress });

    expect(onProgress).toHaveBeenCalled();
  });
});

describe("Configuration and Constants", () => {
  test("should export DEFAULT_CONFIG", () => {
    expect(DEFAULT_CONFIG).toBeDefined();
    expect(DEFAULT_CONFIG.maxTokensPerBatch).toBe(8191);
    expect(DEFAULT_CONFIG.adaptiveSizing).toBe(true);
  });

  test("should export MODEL_LIMITS", () => {
    expect(MODEL_LIMITS).toBeDefined();
    expect(MODEL_LIMITS["text-embedding-ada-002"]).toBeDefined();
    expect(MODEL_LIMITS["text-embedding-3-small"]).toBeDefined();
    expect(MODEL_LIMITS["voyage-large-2"]).toBeDefined();
  });

  test("should have correct model limits", () => {
    expect(MODEL_LIMITS["text-embedding-ada-002"].maxTokens).toBe(8191);
    expect(MODEL_LIMITS["voyage-large-2"].maxTokens).toBe(16000);
    expect(MODEL_LIMITS["cohere-embed-v3"].maxItems).toBe(96);
  });
});
