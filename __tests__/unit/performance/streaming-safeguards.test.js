/**
 * Unit tests for streaming memory safeguards and backpressure management
 * Tests memory monitoring, backpressure control, and streaming processing
 */

const {
  BackpressureController,
  StreamingProcessor,
  MemoryMonitor,
} = require("../../../src/core/performance/streaming-safeguards.js");
const { logger } = require("../../../src/utils/logger");

describe("MemoryMonitor", () => {
  let memoryMonitor;

  beforeEach(() => {
    // Global mock for process.memoryUsage to prevent undefined errors
    jest.spyOn(process, "memoryUsage").mockReturnValue({
      rss: 1024 * 1024 * 150, // 150MB RSS
      heapTotal: 1024 * 1024 * 100, // 100MB heap total
      heapUsed: 1024 * 1024 * 50, // 50MB heap used
      external: 1024 * 1024 * 10, // 10MB external
      arrayBuffers: 1024 * 1024 * 5, // 5MB array buffers (Node v22)
    });

    memoryMonitor = new MemoryMonitor(100); // 100MB limit for testing
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("getCurrentUsage", () => {
    it("should return memory usage object", () => {
      const usage = memoryMonitor.getCurrentUsage();

      expect(usage).toHaveProperty("heapUsed");
      expect(usage).toHaveProperty("heapTotal");
      expect(usage).toHaveProperty("external");
      expect(usage).toHaveProperty("rss");
      expect(typeof usage.heapUsed).toBe("number");
      expect(usage.heapUsed).toBe(1024 * 1024 * 50); // 50MB from global mock
    });
  });

  describe("getUsageRatio", () => {
    it("should calculate usage ratio correctly", () => {
      const ratio = memoryMonitor.getUsageRatio();
      expect(ratio).toBe(0.5); // 50MB / 100MB = 0.5 (from global mock)
    });
  });

  describe("threshold checks", () => {
    beforeEach(() => {
      // Override global mock for high memory usage scenario
      jest.spyOn(process, "memoryUsage").mockReturnValue({
        rss: 1024 * 1024 * 150, // 150MB RSS
        heapTotal: 1024 * 1024 * 100, // 100MB heap total
        heapUsed: 1024 * 1024 * 85, // 85MB heap used (85% of limit)
        external: 1024 * 1024 * 10, // 10MB external
        arrayBuffers: 1024 * 1024 * 5, // 5MB array buffers
      });
    });

    it("should detect warning level", () => {
      expect(memoryMonitor.isWarningLevel()).toBe(true);
      expect(memoryMonitor.isCriticalLevel()).toBe(false);
    });

    it("should generate memory report", () => {
      const report = memoryMonitor.getMemoryReport();

      expect(report).toHaveProperty("heapUsedMB", 85);
      expect(report).toHaveProperty("maxMemoryMB", 100);
      expect(report).toHaveProperty("usagePercentage", 85);
      expect(report).toHaveProperty("status", "warning");
    });
  });
});

describe("BackpressureController", () => {
  let controller;

  beforeEach(() => {
    controller = new BackpressureController({
      maxBufferSize: 100, // Increase buffer size to prevent backpressure
      maxMemoryMB: 1000, // Increase memory limit to prevent backpressure
      pauseThreshold: 0.95, // Very high threshold to prevent backpressure
      resumeThreshold: 0.9,
      checkInterval: 10,
    });
  });

  afterEach(() => {
    // Clean up any intervals
    if (controller.reliefCheckInterval) {
      clearInterval(controller.reliefCheckInterval);
    }
  });

  describe("shouldApplyBackpressure", () => {
    it("should apply backpressure when buffer is full", () => {
      // Fill buffer to capacity (new maxBufferSize is 100)
      for (let i = 0; i < 100; i++) {
        controller.buffer.push(`item${i}`);
      }

      expect(controller.shouldApplyBackpressure()).toBe(true);
    });

    it("should not apply backpressure when conditions are normal", () => {
      // Override global mock for low memory usage scenario
      jest.spyOn(process, "memoryUsage").mockReturnValue({
        rss: 1024 * 1024 * 150, // 150MB RSS
        heapTotal: 1024 * 1024 * 100, // 100MB heap total
        heapUsed: 1024 * 1024 * 50, // 50MB heap used (50% of limit)
        external: 1024 * 1024 * 10, // 10MB external
        arrayBuffers: 1024 * 1024 * 5, // 5MB array buffers
      });

      expect(controller.shouldApplyBackpressure()).toBe(false);
    });
  });

  describe("waitForRelief", () => {
    it("should resolve immediately when no backpressure needed", async () => {
      // Override global mock for low memory usage scenario
      jest.spyOn(process, "memoryUsage").mockReturnValue({
        rss: 1024 * 1024 * 150, // 150MB RSS
        heapTotal: 1024 * 1024 * 100, // 100MB heap total
        heapUsed: 1024 * 1024 * 50, // 50MB heap used (50% of limit)
        external: 1024 * 1024 * 10, // 10MB external
        arrayBuffers: 1024 * 1024 * 5, // 5MB array buffers
      });

      const startTime = Date.now();
      await controller.waitForRelief();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(10); // Should resolve quickly
    });

    it("should wait when backpressure is needed", async () => {
      // Fill buffer to trigger backpressure (new maxBufferSize is 100)
      for (let i = 0; i < 100; i++) {
        controller.buffer.push(`item${i}`);
      }

      // Spy on the internal _log method since logger uses pino which is silent in tests
      const loggerSpy = jest.spyOn(logger, "_log").mockImplementation();

      // Start waiting for relief
      const reliefPromise = controller.waitForRelief();

      // Verify backpressure is applied
      expect(controller.isPaused).toBe(true);
      expect(loggerSpy).toHaveBeenCalledWith(
        "warn",
        "Applying backpressure",
        expect.objectContaining({
          bufferSize: expect.any(Number),
          maxBufferSize: expect.any(Number),
        }),
      );

      // Simulate relief by clearing buffer
      controller.buffer.length = 0;
      controller.relieveBackpressure();

      await reliefPromise;
      expect(controller.isPaused).toBe(false);

      loggerSpy.mockRestore();
    });
  });

  describe("buffer management", () => {
    it("should add items to buffer", async () => {
      // Ensure no backpressure conditions by mocking shouldApplyBackpressure
      jest.spyOn(controller, "shouldApplyBackpressure").mockReturnValue(false);

      await controller.addToBuffer("item1");
      expect(controller.buffer).toContain("item1");
    });

    it("should remove items from buffer", () => {
      controller.buffer.push("item1", "item2", "item3");

      const removed = controller.removeFromBuffer(2);
      expect(removed).toEqual(["item1", "item2"]);
      expect(controller.buffer).toEqual(["item3"]);
    });
  });

  describe("getStatus", () => {
    it("should return current status", () => {
      controller.buffer.push("item1", "item2");

      const status = controller.getStatus();

      expect(status).toHaveProperty("isPaused", false);
      expect(status).toHaveProperty("bufferSize", 2);
      expect(status).toHaveProperty("maxBufferSize", 100); // Updated to new buffer size
      expect(status).toHaveProperty("memory");
      expect(status).toHaveProperty("shouldApplyBackpressure");
    });
  });
});

describe("StreamingProcessor", () => {
  let streamingProcessor;
  let mockPipeline;

  beforeEach(() => {
    streamingProcessor = new StreamingProcessor({
      chunkSize: 2,
      maxMemoryMB: 1000, // Increase to prevent backpressure
      tokenLimit: 1000,
      tokenWarningThreshold: 0.8,
    });

    mockPipeline = {
      loaderInstance: {
        load: jest.fn(),
      },
      embedderInstance: {
        embed: jest.fn().mockImplementation(async (chunks) => {
          // Add realistic timing delay for all tests
          jest.advanceTimersByTime(15);
          return chunks.map(() => [1, 2, 3]);
        }),
      },
      retrieverInstance: {
        store: jest.fn().mockImplementation(async () => {
          // Add realistic timing delay for all tests
          jest.advanceTimersByTime(10);
        }),
      },
    };
  });

  describe("processChunk", () => {
    it("should process chunk successfully", async () => {
      const chunk = "test chunk content";

      // Use the timing-aware mocks from beforeEach (they already have delays)
      // No need to override - the beforeEach setup includes timing delays

      const result = await streamingProcessor.processChunk(chunk, mockPipeline);

      expect(result).toMatchObject({
        chunk,
        vector: [1, 2, 3],
        processed: true,
        timestamp: expect.any(String),
      });
      expect(result.duration).toBeGreaterThan(0);
    });

    it("should handle chunk processing failure", async () => {
      const chunk = "test chunk content";

      // Override only to add failure, but keep timing delay
      mockPipeline.embedderInstance.embed.mockImplementation(async () => {
        jest.advanceTimersByTime(15); // Keep timing delay
        throw new Error("Embedding failed");
      });

      const result = await streamingProcessor.processChunk(chunk, mockPipeline);

      expect(result).toMatchObject({
        chunk,
        processed: false,
        error: "Embedding failed",
        timestamp: expect.any(String),
      });
      expect(result.duration).toBeGreaterThan(0);
    });
  });

  describe("loadInChunks", () => {
    it("should yield chunks in batches", async () => {
      const mockDocuments = [
        {
          chunk: () => ["chunk1", "chunk2", "chunk3", "chunk4"],
        },
      ];

      mockPipeline.loaderInstance.load.mockResolvedValue(mockDocuments);

      const chunks = [];
      for await (const chunk of streamingProcessor.loadInChunks(
        "test.txt",
        mockPipeline.loaderInstance,
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(["chunk1", "chunk2", "chunk3", "chunk4"]);
    });

    it("should handle multiple documents", async () => {
      const mockDocuments = [
        { chunk: () => ["doc1-chunk1", "doc1-chunk2"] },
        { chunk: () => ["doc2-chunk1"] },
      ];

      mockPipeline.loaderInstance.load.mockResolvedValue(mockDocuments);

      const chunks = [];
      for await (const chunk of streamingProcessor.loadInChunks(
        "test.txt",
        mockPipeline.loaderInstance,
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(["doc1-chunk1", "doc1-chunk2", "doc2-chunk1"]);
    });
  });

  describe("processDocumentStream", () => {
    it("should process document stream with progress updates", async () => {
      const mockDocuments = [{ chunk: () => ["chunk1", "chunk2"] }];

      mockPipeline.loaderInstance.load.mockResolvedValue(mockDocuments);
      // Use the timing-aware mocks from beforeEach
      // mockPipeline.embedderInstance.embed already has timing delay
      // mockPipeline.retrieverInstance.store already has timing delay

      const updates = [];
      for await (const update of streamingProcessor.processDocumentStream(
        "test.txt",
        mockPipeline,
      )) {
        updates.push(update);
      }

      expect(updates).toHaveLength(2); // One for each chunk
      expect(updates[0]).toMatchObject({
        chunk: expect.stringContaining("chunk1"),
        processed: true,
        progress: {
          processed: 1,
          failed: 0,
          total: 2, // Total should be 2 chunks
        },
      });
    });

    it("should handle token limit exceeded", async () => {
      // Create processor with very low token limit
      const lowLimitProcessor = new StreamingProcessor({
        tokenLimit: 10, // Very low limit
      });

      const mockDocuments = [
        {
          chunk: () => [
            "this is a very long chunk that exceeds the token limit",
          ],
        },
      ];

      mockPipeline.loaderInstance.load.mockResolvedValue(mockDocuments);

      const updates = [];
      try {
        for await (const update of lowLimitProcessor.processDocumentStream(
          "test.txt",
          mockPipeline,
        )) {
          updates.push(update);
        }
        expect.fail("Should have thrown token limit error");
      } catch (error) {
        expect(error.code).toBe("TOKEN_LIMIT_EXCEEDED");
        expect(error.message).toContain("Token limit exceeded");
      }
    });

    it("should warn when approaching token limit", async () => {
      const consoleSpy = jest.spyOn(logger, "_log").mockImplementation();

      // Create processor with specific token limit to trigger warning
      const warningProcessor = new StreamingProcessor({
        chunkSize: 2,
        maxMemoryMB: 1000,
        tokenLimit: 1000,
        tokenWarningThreshold: 0.8, // Warning at 800 tokens
      });

      // Create exactly 10 chunks with enough content to reach 800+ tokens but not exceed 1000
      // Token limit is 1000, warning threshold is 0.8 (800 tokens)
      // We need to reach 800+ tokens at chunk 10 to trigger warning, but stay under 1000
      // Each chunk needs ~82 tokens to reach 820 total tokens at chunk 10 (safe margin)
      const mediumChunk =
        "This is a medium chunk of text that contains many tokens to trigger the warning condition. ".repeat(
          4,
        ); // ~328 characters = ~82 tokens each
      const mockDocuments = [
        { chunk: () => Array(10).fill(mediumChunk) }, // 10 chunks * 82 tokens = 820 tokens (exceeds 800 threshold, triggers warning, stays under 1000)
      ];

      mockPipeline.loaderInstance.load.mockResolvedValue(mockDocuments);
      // Use timing-aware mocks from beforeEach

      const updates = [];
      for await (const update of warningProcessor.processDocumentStream(
        "test.txt",
        mockPipeline,
      )) {
        updates.push(update);
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        "warn",
        "Approaching token limit",
        expect.objectContaining({
          currentTokens: expect.any(Number),
          tokenLimit: expect.any(Number),
        }),
      );

      consoleSpy.mockRestore();
    });
  });

  describe("getStats", () => {
    it("should return streaming statistics", () => {
      const stats = streamingProcessor.getStats();

      expect(stats).toHaveProperty("backpressure");
      expect(stats).toHaveProperty("tokenLimit", 1000);
      expect(stats).toHaveProperty("chunkSize", 2);
    });
  });
});
