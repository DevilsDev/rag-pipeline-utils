/**
 * Streaming memory safeguards and backpressure management
 * Prevents memory overload during large document processing
 */

const { logger } = require("../../utils/logger.js");

// Use performance.now() for monotonic timing, fallback to perf_hooks for older Node
const { performance } = globalThis.performance
  ? globalThis
  : require("node:perf_hooks");

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
      typeof process.memoryUsage === "function" ? process.memoryUsage() : null;
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
          ? "critical"
          : ratio > this.warningThreshold
            ? "warning"
            : "normal",
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
    console.warn(
      `⚠️  Applying backpressure - Memory: ${memoryReport.usagePercentage}%, Buffer: ${this.buffer.length}/${this.maxBufferSize}`,
    ); // eslint-disable-line no-console

    return new Promise((resolve) => {
      this.waitingResolvers.push(resolve);
      this.startReliefCheck();
    });
  }

  /**
   * Start checking for relief conditions
   */
  startReliefCheck() {
    if (this.reliefCheckInterval) return;

    this.reliefCheckInterval = setInterval(() => {
      const memoryRatio = this.memoryMonitor.getUsageRatio();
      const bufferOk = this.buffer.length < this.maxBufferSize * 0.5;

      if (memoryRatio < this.resumeThreshold && bufferOk) {
        this.relieveBackpressure();
      }
    }, this.checkInterval);

    // Don't keep process alive for relief checks
    if (typeof this.reliefCheckInterval.unref === "function") {
      this.reliefCheckInterval.unref();
    }
  }

  /**
   * Relieve backpressure and resume processing
   */
  relieveBackpressure() {
    if (!this.isPaused) return;

    this.isPaused = false;
    console.log("✅ Backpressure relieved - resuming processing"); // eslint-disable-line no-console

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
          error.code = "TOKEN_LIMIT_EXCEEDED";
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
          console.warn(
            `⚠️  Approaching token limit: ${Math.round(totalTokens)} / ${this.tokenLimit} tokens`,
          ); // eslint-disable-line no-console
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

      console.log(
        `✅ Streaming processing complete: ${chunkCount} chunks, ${Math.round(totalTokens)} tokens`,
      ); // eslint-disable-line no-console
    } catch (error) {
      const status = this.backpressureController.getStatus();
      logger.error("❌ Streaming processing failed:", {
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

module.exports = {
  BackpressureController,
  StreamingProcessor,
  MemoryMonitor,
};
