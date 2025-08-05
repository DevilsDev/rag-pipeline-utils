/**
 * Unit tests for streaming memory safeguards and backpressure management
 * Tests memory monitoring, backpressure control, and streaming processing
 */

import { BackpressureController, StreamingProcessor, MemoryMonitor } from '../../../src/core/performance/streaming-safeguards.js';

describe('MemoryMonitor', () => {
  let memoryMonitor;

  beforeEach(() => {
    memoryMonitor = new MemoryMonitor(100); // 100MB limit for testing
  });

  describe('getCurrentUsage', () => {
    it('should return memory usage object', () => {
      const usage = memoryMonitor.getCurrentUsage();
      
      expect(usage).toHaveProperty('heapUsed');
      expect(usage).toHaveProperty('heapTotal');
      expect(usage).toHaveProperty('external');
      expect(usage).toHaveProperty('rss');
      expect(typeof usage.heapUsed).toBe('number');
    });
  });

  describe('getUsageRatio', () => {
    it('should calculate usage ratio correctly', () => {
      // Mock process.memoryUsage for predictable testing
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn().mockReturnValue({
        heapUsed: 50 * 1024 * 1024, // 50MB
        heapTotal: 100 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        rss: 150 * 1024 * 1024
      });

      const ratio = memoryMonitor.getUsageRatio();
      expect(ratio).toBe(0.5); // 50MB / 100MB = 0.5

      process.memoryUsage = originalMemoryUsage;
    });
  });

  describe('threshold checks', () => {
    beforeEach(() => {
      // Mock memory usage at 85% of limit
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn().mockReturnValue({
        heapUsed: 85 * 1024 * 1024, // 85MB
        heapTotal: 100 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        rss: 150 * 1024 * 1024
      });
    });

    it('should detect warning level', () => {
      expect(memoryMonitor.isWarningLevel()).toBe(true);
      expect(memoryMonitor.isCriticalLevel()).toBe(false);
    });

    it('should generate memory report', () => {
      const report = memoryMonitor.getMemoryReport();
      
      expect(report).toHaveProperty('heapUsedMB', 85);
      expect(report).toHaveProperty('maxMemoryMB', 100);
      expect(report).toHaveProperty('usagePercentage', 85);
      expect(report).toHaveProperty('status', 'warning');
    });
  });
});

describe('BackpressureController', () => {
  let controller;

  beforeEach(() => {
    controller = new BackpressureController({
      maxBufferSize: 5,
      maxMemoryMB: 100,
      pauseThreshold: 0.8,
      resumeThreshold: 0.6,
      checkInterval: 10
    });
  });

  afterEach(() => {
    // Clean up any intervals
    if (controller.reliefCheckInterval) {
      clearInterval(controller.reliefCheckInterval);
    }
  });

  describe('shouldApplyBackpressure', () => {
    it('should apply backpressure when buffer is full', () => {
      // Fill buffer to capacity
      for (let i = 0; i < 5; i++) {
        controller.buffer.push(`item${i}`);
      }
      
      expect(controller.shouldApplyBackpressure()).toBe(true);
    });

    it('should not apply backpressure when conditions are normal', () => {
      // Mock low memory usage
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn().mockReturnValue({
        heapUsed: 50 * 1024 * 1024, // 50MB (50% of 100MB limit)
        heapTotal: 100 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        rss: 150 * 1024 * 1024
      });

      expect(controller.shouldApplyBackpressure()).toBe(false);

      process.memoryUsage = originalMemoryUsage;
    });
  });

  describe('waitForRelief', () => {
    it('should resolve immediately when no backpressure needed', async () => {
      // Mock low memory usage
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn().mockReturnValue({
        heapUsed: 50 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        rss: 150 * 1024 * 1024
      });

      const startTime = Date.now();
      await controller.waitForRelief();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(10); // Should resolve quickly

      process.memoryUsage = originalMemoryUsage;
    });

    it('should wait when backpressure is needed', async () => {
      // Fill buffer to trigger backpressure
      for (let i = 0; i < 5; i++) {
        controller.buffer.push(`item${i}`);
      }

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Start waiting for relief
      const reliefPromise = controller.waitForRelief();

      // Verify backpressure is applied
      expect(controller.isPaused).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Applying backpressure')
      );

      // Simulate relief by clearing buffer
      controller.buffer.length = 0;
      controller.relieveBackpressure();

      await reliefPromise;
      expect(controller.isPaused).toBe(false);

      consoleSpy.mockRestore();
    });
  });

  describe('buffer management', () => {
    it('should add items to buffer', async () => {
      await controller.addToBuffer('item1');
      expect(controller.buffer).toContain('item1');
    });

    it('should remove items from buffer', () => {
      controller.buffer.push('item1', 'item2', 'item3');
      
      const removed = controller.removeFromBuffer(2);
      expect(removed).toEqual(['item1', 'item2']);
      expect(controller.buffer).toEqual(['item3']);
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      controller.buffer.push('item1', 'item2');
      
      const status = controller.getStatus();
      
      expect(status).toHaveProperty('isPaused', false);
      expect(status).toHaveProperty('bufferSize', 2);
      expect(status).toHaveProperty('maxBufferSize', 5);
      expect(status).toHaveProperty('memory');
      expect(status).toHaveProperty('shouldApplyBackpressure');
    });
  });
});

describe('StreamingProcessor', () => {
  let streamingProcessor;
  let mockPipeline;

  beforeEach(() => {
    streamingProcessor = new StreamingProcessor({
      chunkSize: 2,
      maxMemoryMB: 100,
      tokenLimit: 1000,
      tokenWarningThreshold: 0.8
    });

    mockPipeline = {
      loaderInstance: {
        load: jest.fn()
      },
      embedderInstance: {
        embed: jest.fn()
      },
      retrieverInstance: {
        store: jest.fn()
      }
    };
  });

  describe('processChunk', () => {
    it('should process chunk successfully', async () => {
      const chunk = 'test chunk content';
      const mockVector = [[1, 2, 3]];
      
      mockPipeline.embedderInstance.embed.mockResolvedValue(mockVector);
      mockPipeline.retrieverInstance.store.mockResolvedValue();

      const result = await streamingProcessor.processChunk(chunk, mockPipeline);

      expect(result).toMatchObject({
        chunk,
        vector: [1, 2, 3],
        processed: true,
        timestamp: expect.any(String)
      });
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should handle chunk processing failure', async () => {
      const chunk = 'test chunk content';
      
      mockPipeline.embedderInstance.embed.mockRejectedValue(new Error('Embedding failed'));

      const result = await streamingProcessor.processChunk(chunk, mockPipeline);

      expect(result).toMatchObject({
        chunk,
        processed: false,
        error: 'Embedding failed',
        timestamp: expect.any(String)
      });
      expect(result.duration).toBeGreaterThan(0);
    });
  });

  describe('loadInChunks', () => {
    it('should yield chunks in batches', async () => {
      const mockDocuments = [
        {
          chunk: () => ['chunk1', 'chunk2', 'chunk3', 'chunk4']
        }
      ];
      
      mockPipeline.loaderInstance.load.mockResolvedValue(mockDocuments);

      const chunks = [];
      for await (const chunk of streamingProcessor.loadInChunks('test.txt', mockPipeline.loaderInstance)) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['chunk1', 'chunk2', 'chunk3', 'chunk4']);
    });

    it('should handle multiple documents', async () => {
      const mockDocuments = [
        { chunk: () => ['doc1-chunk1', 'doc1-chunk2'] },
        { chunk: () => ['doc2-chunk1'] }
      ];
      
      mockPipeline.loaderInstance.load.mockResolvedValue(mockDocuments);

      const chunks = [];
      for await (const chunk of streamingProcessor.loadInChunks('test.txt', mockPipeline.loaderInstance)) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['doc1-chunk1', 'doc1-chunk2', 'doc2-chunk1']);
    });
  });

  describe('processDocumentStream', () => {
    it('should process document stream with progress updates', async () => {
      const mockDocuments = [
        { chunk: () => ['chunk1', 'chunk2'] }
      ];
      
      mockPipeline.loaderInstance.load.mockResolvedValue(mockDocuments);
      mockPipeline.embedderInstance.embed.mockResolvedValue([[1, 2]]);
      mockPipeline.retrieverInstance.store.mockResolvedValue();

      const updates = [];
      for await (const update of streamingProcessor.processDocumentStream('test.txt', mockPipeline)) {
        updates.push(update);
      }

      expect(updates).toHaveLength(2); // One for each chunk
      expect(updates[0]).toMatchObject({
        chunk: expect.stringContaining('chunk1'),
        processed: true,
        progress: {
          processed: 1,
          failed: 0,
          total: 1
        }
      });
    });

    it('should handle token limit exceeded', async () => {
      // Create processor with very low token limit
      const lowLimitProcessor = new StreamingProcessor({
        tokenLimit: 10 // Very low limit
      });

      const mockDocuments = [
        { chunk: () => ['this is a very long chunk that exceeds the token limit'] }
      ];
      
      mockPipeline.loaderInstance.load.mockResolvedValue(mockDocuments);

      const updates = [];
      try {
        for await (const update of lowLimitProcessor.processDocumentStream('test.txt', mockPipeline)) {
          updates.push(update);
        }
        expect.fail('Should have thrown token limit error');
      } catch (error) {
        expect(error.code).toBe('TOKEN_LIMIT_EXCEEDED');
        expect(error.message).toContain('Token limit exceeded');
      }
    });

    it('should warn when approaching token limit', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const mockDocuments = [
        { chunk: () => ['chunk that approaches token limit'.repeat(20)] }
      ];
      
      mockPipeline.loaderInstance.load.mockResolvedValue(mockDocuments);
      mockPipeline.embedderInstance.embed.mockResolvedValue([[1, 2]]);
      mockPipeline.retrieverInstance.store.mockResolvedValue();

      const updates = [];
      for await (const update of streamingProcessor.processDocumentStream('test.txt', mockPipeline)) {
        updates.push(update);
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Approaching token limit')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getStats', () => {
    it('should return streaming statistics', () => {
      const stats = streamingProcessor.getStats();
      
      expect(stats).toHaveProperty('backpressure');
      expect(stats).toHaveProperty('tokenLimit', 1000);
      expect(stats).toHaveProperty('chunkSize', 2);
    });
  });
});
