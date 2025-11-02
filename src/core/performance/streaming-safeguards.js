/**
 * Streaming memory safeguards and backpressure management
 * Prevents memory overload during large document processing
 */

const { logger } = require('../../utils/logger.js');

// Use performance.now() for monotonic timing, fallback to perf_hooks for older Node
const { performance } = globalThis.performance
  ? globalThis
  : require('node:perf_hooks');

/**
 * Memory monitor for tracking heap usage
 */
class MemoryMonitor {
  constructor(maxMemoryMB = 512) {
    this.maxMemoryBytes = maxMemoryMB * 1024 * 1024;
    this.warningThreshold = 0.8; // 80% of max memory
    this.criticalThreshold = 0.9; // 90% of max memory
  }

  getCurrentUsage() {
    const usage =
      typeof process.memoryUsage === 'function' ? process.memoryUsage() : null;
    const heapUsed = usage?.heapUsed ?? 0;
    const heapTotal = usage?.heapTotal ?? Math.max(1, heapUsed);
    return {
      heapUsed,
      heapTotal,
      external: usage?.external ?? 0,
      rss: usage?.rss ?? 0,
      heapUsedMB: Math.round(heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(heapTotal / 1024 / 1024),
    };
  }

  getUsageRatio() {
    const usage = this.getCurrentUsage();
    return usage.heapUsed / this.maxMemoryBytes;
  }

  isWarningLevel() {
    return this.getUsageRatio() > this.warningThreshold;
  }

  isCriticalLevel() {
    return this.getUsageRatio() > this.criticalThreshold;
  }

  getMemoryReport() {
    const usage = this.getCurrentUsage();
    const ratio = this.getUsageRatio();

    return {
      heapUsedMB: usage.heapUsedMB,
      heapTotalMB: usage.heapTotalMB,
      maxMemoryMB: Math.round(this.maxMemoryBytes / 1024 / 1024),
      usagePercentage: Math.round(ratio * 100),
      status:
        ratio > this.criticalThreshold
          ? 'critical'
          : ratio > this.warningThreshold
            ? 'warning'
            : 'normal',
    };
  }
}

/**
 * Backpressure controller for streaming operations
 */
class BackpressureController {
  constructor(_options = {}) {
    this.maxBufferSize = _options.maxBufferSize || 100;
    this.memoryMonitor = new MemoryMonitor(_options.maxMemoryMB);
    this.pauseThreshold = _options.pauseThreshold || 0.85;
    this.resumeThreshold = _options.resumeThreshold || 0.7;
    this.checkInterval = _options.checkInterval || 1000; // ms

    this.isPaused = false;
    this.buffer = [];
    this.waitingResolvers = [];
    this.reliefCheckInterval = null; // Initialize to prevent race conditions
  }

  /**
   * Check if backpressure should be applied
   * @returns {boolean} True if processing should be paused
   */
  shouldApplyBackpressure() {
    const memoryRatio = this.memoryMonitor.getUsageRatio();
    const bufferFull = this.buffer.length >= this.maxBufferSize;

    return memoryRatio > this.pauseThreshold || bufferFull;
  }

  /**
   * Wait for backpressure to be relieved
   * @returns {Promise<void>}
   */
  async waitForRelief() {
    if (!this.shouldApplyBackpressure()) {
      return;
    }

    this.isPaused = true;
    const memoryReport = this.memoryMonitor.getMemoryReport();
    logger.warn('Applying backpressure', {
      memoryPercentage: memoryReport.usagePercentage,
      bufferSize: this.buffer.length,
      maxBufferSize: this.maxBufferSize,
    });

    return new Promise((resolve) => {
      this.waitingResolvers.push(resolve);
      this.startReliefCheck();
    });
  }

  /**
   * Start checking for relief conditions
   * Race condition fix: prevents multiple intervals from being created
   */
  startReliefCheck() {
    // Critical section: check and set in a way that prevents race conditions
    if (this.reliefCheckInterval !== null) {
      return;
    }

    // Immediately set to a sentinel value to prevent concurrent calls from proceeding
    this.reliefCheckInterval = true;

    // Create the actual interval
    this.reliefCheckInterval = setInterval(() => {
      const memoryRatio = this.memoryMonitor.getUsageRatio();
      const bufferOk = this.buffer.length < this.maxBufferSize * 0.5;

      if (memoryRatio < this.resumeThreshold && bufferOk) {
        this.relieveBackpressure();
      }
    }, this.checkInterval);

    // Don't keep process alive for relief checks
    if (typeof this.reliefCheckInterval.unref === 'function') {
      this.reliefCheckInterval.unref();
    }
  }

  /**
   * Relieve backpressure and resume processing
   */
  relieveBackpressure() {
    if (!this.isPaused) return;

    this.isPaused = false;
    logger.info('Backpressure relieved - resuming processing');

    // Clear interval
    if (this.reliefCheckInterval) {
      clearInterval(this.reliefCheckInterval);
      this.reliefCheckInterval = null;
    }

    // Resolve all waiting promises
    const resolvers = this.waitingResolvers.splice(0);
    resolvers.forEach((resolve) => resolve());
  }

  /**
   * Add item to buffer with backpressure check
   * @param {any} item - Item to buffer
   */
  async addToBuffer(item) {
    await this.waitForRelief();
    this.buffer.push(item);
  }

  /**
   * Remove items from buffer
   * @param {number} count - Number of items to remove
   * @returns {any[]} Removed items
   */
  removeFromBuffer(count = 1) {
    return this.buffer.splice(0, count);
  }

  /**
   * Get current status
   * @returns {object} Status information
   */
  getStatus() {
    const memoryReport = this.memoryMonitor.getMemoryReport();

    return {
      isPaused: this.isPaused,
      bufferSize: this.buffer.length,
      maxBufferSize: this.maxBufferSize,
      memory: memoryReport,
      shouldApplyBackpressure: this.shouldApplyBackpressure(),
    };
  }
}

/**
 * Streaming processor with memory safeguards
 */
class StreamingProcessor {
  constructor(_options = {}) {
    this.chunkSize = _options.chunkSize || 1000;
    this.backpressureController = new BackpressureController(_options);
    this.tokenLimit = _options.tokenLimit || 100000; // Token limit per stream
    this.tokenWarningThreshold = _options.tokenWarningThreshold || 0.8;
  }

  /**
   * Process document stream with memory safeguards
   * @param {string} docPath - Path to document
   * @param {object} pipeline - Pipeline _instance
   * @returns {AsyncGenerator} Stream of processed chunks
   */
  async *processDocumentStream(docPath, pipeline) {
    let totalTokens = 0;
    let chunkCount = 0;
    let processedCount = 0;
    let failedCount = 0;
    let totalChunks = 0;

    try {
      // First, count total chunks for progress tracking
      const allChunks = [];
      for await (const documentChunk of this.loadInChunks(
        docPath,
        pipeline.loaderInstance,
      )) {
        allChunks.push(documentChunk);
      }
      totalChunks = allChunks.length;

      for (const documentChunk of allChunks) {
        // Check memory and apply backpressure if needed
        await this.backpressureController.waitForRelief();

        // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
        const estimatedTokens = documentChunk.length / 4;
        totalTokens += estimatedTokens;

        // Check token limits
        if (totalTokens > this.tokenLimit) {
          const error = new Error(
            `Token limit exceeded: ${totalTokens} > ${this.tokenLimit}`,
          );
          error.code = 'TOKEN_LIMIT_EXCEEDED';
          throw error;
        }

        // Process chunk
        const processed = await this.processChunk(documentChunk, pipeline);
        chunkCount++;

        // Warn if approaching token limit (check after incrementing chunkCount)
        if (
          totalTokens > this.tokenLimit * this.tokenWarningThreshold &&
          chunkCount % 10 === 0
        ) {
          logger.warn('Approaching token limit', {
            currentTokens: Math.round(totalTokens),
            tokenLimit: this.tokenLimit,
          });
        }

        if (processed.processed) {
          processedCount++;
        } else {
          failedCount++;
        }

        // Add to buffer and yield
        await this.backpressureController.addToBuffer(processed);

        // Yield processed chunks from buffer with progress information
        const bufferedItems = this.backpressureController.removeFromBuffer(1);
        for (const item of bufferedItems) {
          yield {
            ...item,
            progress: {
              processed: processedCount,
              failed: failedCount,
              total: totalChunks,
            },
          };
        }

        // Periodic garbage collection hint
        if (chunkCount % 50 === 0 && global.gc) {
          global.gc();
        }
      }

      // Yield any remaining buffered items
      const remainingItems = this.backpressureController.removeFromBuffer(
        this.backpressureController.buffer.length,
      );
      for (const item of remainingItems) {
        yield item;
      }

      logger.info('Streaming processing complete', {
        chunkCount,
        totalTokens: Math.round(totalTokens),
      });
    } catch (error) {
      const status = this.backpressureController.getStatus();
      logger.error('Streaming processing failed', {
        error: error.message,
        totalTokens: Math.round(totalTokens),
        chunkCount,
        memoryStatus: status.memory,
        bufferSize: status.bufferSize,
      });
      throw error;
    }
  }

  /**
   * Load document in chunks
   * @param {string} docPath - Document path
   * @param {object} loader - Loader _instance
   * @returns {AsyncGenerator} Stream of document chunks
   */
  async *loadInChunks(docPath, loader) {
    const documents = await loader.load(docPath);

    for (const doc of documents) {
      const chunks = doc.chunk();

      // Yield chunks in batches to control memory
      for (let i = 0; i < chunks.length; i += this.chunkSize) {
        const batch = chunks.slice(i, i + this.chunkSize);
        for (const chunk of batch) {
          yield chunk;
        }
      }
    }
  }

  /**
   * Process a single chunk
   * @param {string} chunk - Text chunk
   * @param {object} pipeline - Pipeline _instance
   * @returns {Promise<object>} Processed chunk
   */
  async processChunk(chunk, pipeline) {
    const start = performance.now();

    try {
      // Embed the chunk
      const vector = await pipeline.embedderInstance.embed([chunk]);

      // Store in retriever
      await pipeline.retrieverInstance.store(vector);

      const end = performance.now();
      const duration = Math.max(1, Math.round(end - start)); // clamp to minimum 1ms

      return {
        chunk,
        vector: vector[0],
        processed: true,
        duration,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const end = performance.now();
      const duration = Math.max(1, Math.round(end - start)); // clamp to minimum 1ms

      return {
        chunk,
        processed: false,
        error: error.message,
        duration,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get streaming statistics
   * @returns {object} Statistics
   */
  getStats() {
    const status = this.backpressureController.getStatus();

    return {
      backpressure: status,
      tokenLimit: this.tokenLimit,
      chunkSize: this.chunkSize,
    };
  }
}

/**
 * Helper utilities for streaming operations
 */
class StreamingHelpers {
  /**
   * Create a streaming processor with default configuration
   * @param {object} options - Configuration options
   * @returns {StreamingProcessor} Configured streaming processor
   */
  static createProcessor(options = {}) {
    return new StreamingProcessor({
      chunkSize: options.chunkSize || 1000,
      maxMemoryMB: options.maxMemoryMB || 512,
      tokenLimit: options.tokenLimit || 100000,
      tokenWarningThreshold: options.tokenWarningThreshold || 0.8,
      pauseThreshold: options.pauseThreshold || 0.85,
      resumeThreshold: options.resumeThreshold || 0.7,
      checkInterval: options.checkInterval || 1000,
      ...options,
    });
  }

  /**
   * Create a memory monitor with default configuration
   * @param {number} maxMemoryMB - Maximum memory in MB
   * @returns {MemoryMonitor} Configured memory monitor
   */
  static createMemoryMonitor(maxMemoryMB = 512) {
    return new MemoryMonitor(maxMemoryMB);
  }

  /**
   * Create a backpressure controller with default configuration
   * @param {object} options - Configuration options
   * @returns {BackpressureController} Configured backpressure controller
   */
  static createBackpressureController(options = {}) {
    return new BackpressureController({
      maxBufferSize: options.maxBufferSize || 100,
      maxMemoryMB: options.maxMemoryMB || 512,
      pauseThreshold: options.pauseThreshold || 0.85,
      resumeThreshold: options.resumeThreshold || 0.7,
      checkInterval: options.checkInterval || 1000,
      ...options,
    });
  }

  /**
   * Estimate token count from text
   * @param {string} text - Input text
   * @returns {number} Estimated token count
   */
  static estimateTokens(text) {
    if (typeof text !== 'string') return 0;
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if memory usage is within safe limits
   * @param {number} maxMemoryMB - Maximum allowed memory in MB
   * @returns {object} Memory status report
   */
  static checkMemoryStatus(maxMemoryMB = 512) {
    const monitor = new MemoryMonitor(maxMemoryMB);
    const usage = monitor.getCurrentUsage();
    const ratio = monitor.getUsageRatio();

    return {
      ...usage,
      ratio,
      isWarning: monitor.isWarningLevel(),
      isCritical: monitor.isCriticalLevel(),
      status: ratio > 0.9 ? 'critical' : ratio > 0.8 ? 'warning' : 'normal',
    };
  }

  /**
   * Create a streaming configuration for different use cases
   * @param {string} profile - Configuration profile ('light', 'standard', 'heavy')
   * @returns {object} Configuration object
   */
  static getStreamingProfile(profile = 'standard') {
    const profiles = {
      light: {
        chunkSize: 500,
        maxMemoryMB: 256,
        tokenLimit: 50000,
        maxBufferSize: 50,
        pauseThreshold: 0.8,
        resumeThreshold: 0.6,
      },
      standard: {
        chunkSize: 1000,
        maxMemoryMB: 512,
        tokenLimit: 100000,
        maxBufferSize: 100,
        pauseThreshold: 0.85,
        resumeThreshold: 0.7,
      },
      heavy: {
        chunkSize: 2000,
        maxMemoryMB: 1024,
        tokenLimit: 200000,
        maxBufferSize: 200,
        pauseThreshold: 0.9,
        resumeThreshold: 0.75,
      },
    };

    return profiles[profile] || profiles.standard;
  }

  /**
   * Wrap an async iterator with memory monitoring
   * @param {AsyncIterator} iterator - Source async iterator
   * @param {object} options - Monitoring options
   * @returns {AsyncGenerator} Monitored async generator
   */
  static async *withMemoryMonitoring(iterator, options = {}) {
    const monitor = new MemoryMonitor(options.maxMemoryMB || 512);
    let itemCount = 0;

    try {
      for await (const item of iterator) {
        itemCount++;

        // Check memory every N items
        if (itemCount % (options.checkInterval || 10) === 0) {
          const report = monitor.getMemoryReport();

          if (monitor.isCriticalLevel()) {
            throw new Error(
              `Critical memory usage: ${report.usagePercentage}% (${report.heapUsedMB}MB)`,
            );
          }

          if (monitor.isWarningLevel() && options.onWarning) {
            options.onWarning(report);
          }
        }

        yield {
          ...item,
          memoryStatus:
            itemCount % (options.reportInterval || 100) === 0
              ? monitor.getMemoryReport()
              : undefined,
        };
      }
    } catch (error) {
      const finalReport = monitor.getMemoryReport();
      logger.error('Memory monitoring error:', {
        error: error.message,
        itemsProcessed: itemCount,
        finalMemoryStatus: finalReport,
      });
      throw error;
    }
  }

  /**
   * Create a throttled async iterator
   * @param {AsyncIterator} iterator - Source async iterator
   * @param {number} delayMs - Delay between items in milliseconds
   * @returns {AsyncGenerator} Throttled async generator
   */
  static async *throttle(iterator, delayMs = 100) {
    for await (const item of iterator) {
      yield item;

      // Add delay between items
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  /**
   * Batch items from an async iterator
   * @param {AsyncIterator} iterator - Source async iterator
   * @param {number} batchSize - Number of items per batch
   * @returns {AsyncGenerator} Batched async generator
   */
  static async *batch(iterator, batchSize = 10) {
    let batch = [];

    for await (const item of iterator) {
      batch.push(item);

      if (batch.length >= batchSize) {
        yield batch;
        batch = [];
      }
    }

    // Yield remaining items
    if (batch.length > 0) {
      yield batch;
    }
  }
}

module.exports = {
  BackpressureController,
  StreamingProcessor,
  MemoryMonitor,
  StreamingHelpers,
  // Convenience exports
  createProcessor: StreamingHelpers.createProcessor,
  createMemoryMonitor: StreamingHelpers.createMemoryMonitor,
  createBackpressureController: StreamingHelpers.createBackpressureController,
  estimateTokens: StreamingHelpers.estimateTokens,
  checkMemoryStatus: StreamingHelpers.checkMemoryStatus,
  getStreamingProfile: StreamingHelpers.getStreamingProfile,
  withMemoryMonitoring: StreamingHelpers.withMemoryMonitoring,
  throttle: StreamingHelpers.throttle,
  batch: StreamingHelpers.batch,
};
