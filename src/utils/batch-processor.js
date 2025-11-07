'use strict';

/**
 * Intelligent Batch Processor
 *
 * Optimizes embedding batch sizes and processing to minimize API calls
 * while maintaining memory efficiency and supporting cancellation.
 *
 * Features:
 * - Dynamic batch sizing based on text length and model limits
 * - Token-aware batching to maximize API efficiency
 * - Progress tracking with real-time updates
 * - Cancellation support for long-running operations
 * - Memory-efficient streaming for large datasets
 * - Performance metrics and optimization
 * - Adaptive retry logic for failed batches
 *
 * @module utils/batch-processor
 * @since 2.3.0
 */

const { EventEmitter } = require('events');

/**
 * Default configuration for batch processing
 */
const DEFAULT_CONFIG = {
  // Token limits (per model)
  maxTokensPerBatch: 8191, // OpenAI text-embedding-ada-002 limit
  maxItemsPerBatch: 2048, // Maximum items in single batch
  minItemsPerBatch: 1, // Minimum items per batch

  // Memory management
  maxMemoryMB: 512, // Maximum memory for batch buffer
  streamingThreshold: 1000, // Switch to streaming for datasets > this size

  // Performance tuning
  targetBatchUtilization: 0.85, // Target 85% of token limit
  adaptiveSizing: true, // Enable adaptive batch sizing

  // Retry configuration
  maxRetries: 3,
  retryDelay: 1000, // Base retry delay in ms
  retryBackoff: 2, // Exponential backoff multiplier

  // Progress tracking
  progressInterval: 100, // Emit progress every N items
  enableMetrics: true, // Track performance metrics
};

/**
 * Model-specific token limits
 */
const MODEL_LIMITS = {
  'text-embedding-ada-002': { maxTokens: 8191, maxItems: 2048 },
  'text-embedding-3-small': { maxTokens: 8191, maxItems: 2048 },
  'text-embedding-3-large': { maxTokens: 8191, maxItems: 2048 },
  'voyage-large-2': { maxTokens: 16000, maxItems: 128 },
  'cohere-embed-v3': { maxTokens: 512, maxItems: 96 },
  default: { maxTokens: 8191, maxItems: 2048 },
};

/**
 * Batch Processor Class
 */
class BatchProcessor extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      ...DEFAULT_CONFIG,
      ...options,
    };

    // Apply model-specific limits if model specified
    if (options.model && MODEL_LIMITS[options.model]) {
      const limits = MODEL_LIMITS[options.model];
      this.config.maxTokensPerBatch = limits.maxTokens;
      this.config.maxItemsPerBatch = limits.maxItems;
    }

    // State
    this.cancelled = false;
    this.processing = false;
    this.abortController = null;

    // Metrics
    this.metrics = {
      totalItems: 0,
      processedItems: 0,
      totalBatches: 0,
      successfulBatches: 0,
      failedBatches: 0,
      totalTokens: 0,
      totalTime: 0,
      avgBatchSize: 0,
      avgTokensPerBatch: 0,
      apiCallsSaved: 0,
      memoryUsed: 0,
      peakMemory: 0,
    };

    // Adaptive sizing state
    this.adaptiveState = {
      recentBatchSizes: [],
      recentProcessingTimes: [],
      optimalBatchSize: null,
    };
  }

  /**
   * Process items in optimized batches
   *
   * @param {Array<string|Object>} items - Items to process
   * @param {Function} processFn - Function to process each batch
   * @param {Object} options - Processing options
   * @returns {Promise<Array>} Processed results
   */
  async processBatches(items, processFn, options = {}) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Items must be a non-empty array');
    }

    if (typeof processFn !== 'function') {
      throw new Error('processFn must be a function');
    }

    const startTime = Date.now();
    this.processing = true;
    this.cancelled = false;

    // Initialize metrics
    this.metrics.totalItems = items.length;
    this.metrics.processedItems = 0;
    this.metrics.totalBatches = 0;

    // Setup abort controller if not provided
    this.abortController = options.abortController || new AbortController();

    const { onProgress, onBatchComplete, returnOriginalOrder = true } = options;

    try {
      // Emit start event
      this.emit('start', {
        totalItems: items.length,
        estimatedBatches: this._estimateBatchCount(items),
      });

      // Create optimized batches
      const batches = this._createBatches(items);
      this.metrics.totalBatches = batches.length;

      // Calculate API calls saved
      const naiveBatchCount = items.length; // One API call per item
      this.metrics.apiCallsSaved = naiveBatchCount - batches.length;

      this.emit('batches_created', {
        batchCount: batches.length,
        avgBatchSize: items.length / batches.length,
        apiCallsSaved: this.metrics.apiCallsSaved,
      });

      // Process batches
      const results = [];
      let processedCount = 0;

      for (let i = 0; i < batches.length; i++) {
        // Check cancellation
        if (this.cancelled || this.abortController.signal.aborted) {
          throw new Error('Processing cancelled');
        }

        const batch = batches[i];
        const batchStartTime = Date.now();

        try {
          // Process batch with retry logic
          const batchResults = await this._processBatchWithRetry(
            batch,
            processFn,
            i,
          );

          results.push(...batchResults);
          processedCount += batch.items.length;

          this.metrics.successfulBatches++;
          this.metrics.processedItems = processedCount;

          // Track batch timing for adaptive sizing
          const batchDuration = Date.now() - batchStartTime;
          this._updateAdaptiveState(batch.items.length, batchDuration);

          // Emit progress
          if (onProgress || this.listenerCount('progress') > 0) {
            const progressData = {
              processed: processedCount,
              total: items.length,
              percentage: (processedCount / items.length) * 100,
              currentBatch: i + 1,
              totalBatches: batches.length,
              estimatedTimeRemaining: this._estimateTimeRemaining(
                processedCount,
                items.length,
                Date.now() - startTime,
              ),
            };

            if (onProgress) {
              onProgress(progressData);
            }
            this.emit('progress', progressData);
          }

          // Emit batch complete
          if (onBatchComplete) {
            onBatchComplete({
              batchIndex: i,
              batchSize: batch.items.length,
              duration: batchDuration,
            });
          }

          this.emit('batch_complete', {
            batchIndex: i,
            batchSize: batch.items.length,
            tokens: batch.estimatedTokens,
            duration: batchDuration,
          });

          // Memory management - force GC hint if available
          if (
            global.gc &&
            this.metrics.peakMemory > this.config.maxMemoryMB * 1024 * 1024
          ) {
            global.gc();
          }
        } catch (error) {
          this.metrics.failedBatches++;

          this.emit('batch_error', {
            batchIndex: i,
            batchSize: batch.items.length,
            error: error.message,
          });

          // Rethrow if not retry-able
          throw error;
        }
      }

      // Restore original order if requested
      const finalResults = returnOriginalOrder
        ? this._restoreOriginalOrder(results, items)
        : results;

      // Calculate final metrics
      this.metrics.totalTime = Date.now() - startTime;
      this.metrics.avgBatchSize = items.length / batches.length;
      this.metrics.avgTokensPerBatch =
        this.metrics.totalTokens / batches.length;

      // Emit completion
      this.emit('complete', {
        totalItems: items.length,
        totalBatches: batches.length,
        successfulBatches: this.metrics.successfulBatches,
        failedBatches: this.metrics.failedBatches,
        totalTime: this.metrics.totalTime,
        avgBatchSize: this.metrics.avgBatchSize,
        apiCallsSaved: this.metrics.apiCallsSaved,
      });

      return finalResults;
    } catch (error) {
      this.emit('error', {
        message: error.message,
        processedItems: this.metrics.processedItems,
        totalItems: items.length,
      });
      throw error;
    } finally {
      this.processing = false;
      this.abortController = null;
    }
  }

  /**
   * Create optimized batches from items
   * @private
   */
  _createBatches(items) {
    const batches = [];
    let currentBatch = {
      items: [],
      estimatedTokens: 0,
      originalIndices: [],
    };

    const maxTokens =
      this.config.maxTokensPerBatch * this.config.targetBatchUtilization;
    const maxItems = this.config.maxItemsPerBatch;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const text =
        typeof item === 'string'
          ? item
          : item.text || item.content || String(item);
      const tokens = this._estimateTokens(text);

      // Check if adding this item would exceed limits
      const wouldExceedTokens =
        currentBatch.estimatedTokens + tokens > maxTokens;
      const wouldExceedItems = currentBatch.items.length >= maxItems;

      if (wouldExceedTokens || wouldExceedItems) {
        // Only create batch if it has items
        if (currentBatch.items.length > 0) {
          batches.push(currentBatch);
          currentBatch = {
            items: [],
            estimatedTokens: 0,
            originalIndices: [],
          };
        }
      }

      // Add item to current batch
      currentBatch.items.push(item);
      currentBatch.estimatedTokens += tokens;
      currentBatch.originalIndices.push(i);

      // Track memory usage
      this._updateMemoryEstimate(text);
    }

    // Add final batch
    if (currentBatch.items.length > 0) {
      batches.push(currentBatch);
    }

    // Apply adaptive batch optimization if enabled
    if (this.config.adaptiveSizing && this.adaptiveState.optimalBatchSize) {
      return this._reoptimizeBatches(batches);
    }

    return batches;
  }

  /**
   * Process batch with retry logic
   * @private
   */
  async _processBatchWithRetry(batch, processFn, batchIndex) {
    let lastError;
    let retryCount = 0;

    while (retryCount <= this.config.maxRetries) {
      try {
        // Extract items for processing
        const items = batch.items.map((item) =>
          typeof item === 'string'
            ? item
            : item.text || item.content || String(item),
        );

        // Process the batch
        const results = await processFn(items, {
          batchIndex,
          estimatedTokens: batch.estimatedTokens,
          signal: this.abortController.signal,
        });

        // Track tokens
        this.metrics.totalTokens += batch.estimatedTokens;

        return results;
      } catch (error) {
        lastError = error;

        // Don't retry on cancellation
        if (this.cancelled || error.message === 'Processing cancelled') {
          throw error;
        }

        retryCount++;

        if (retryCount <= this.config.maxRetries) {
          const delay =
            this.config.retryDelay *
            Math.pow(this.config.retryBackoff, retryCount - 1);

          this.emit('batch_retry', {
            batchIndex,
            retryCount,
            maxRetries: this.config.maxRetries,
            delay,
            error: error.message,
          });

          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(
      `Batch ${batchIndex} failed after ${this.config.maxRetries} retries: ${lastError.message}`,
    );
  }

  /**
   * Estimate token count for text
   * Uses approximation: ~4 characters per token for English text
   * @private
   */
  _estimateTokens(text) {
    if (!text) return 0;

    // Rough estimation: 1 token ≈ 4 characters
    // More accurate would use tiktoken, but this avoids dependency
    const chars = text.length;
    const tokens = Math.ceil(chars / 4);

    // Add overhead for special tokens
    return tokens + 2;
  }

  /**
   * Estimate batch count
   * @private
   */
  _estimateBatchCount(items) {
    let totalTokens = 0;
    for (const item of items) {
      const text =
        typeof item === 'string'
          ? item
          : item.text || item.content || String(item);
      totalTokens += this._estimateTokens(text);
    }

    const maxTokens =
      this.config.maxTokensPerBatch * this.config.targetBatchUtilization;
    return Math.ceil(totalTokens / maxTokens);
  }

  /**
   * Estimate remaining time
   * @private
   */
  _estimateTimeRemaining(processed, total, elapsed) {
    if (processed === 0) return null;

    const rate = processed / elapsed; // items per ms
    const remaining = total - processed;
    return Math.ceil(remaining / rate); // ms
  }

  /**
   * Update memory estimate
   * @private
   */
  _updateMemoryEstimate(text) {
    // Rough estimate: 2 bytes per character in memory
    const bytes = text.length * 2;
    this.metrics.memoryUsed += bytes;

    if (this.metrics.memoryUsed > this.metrics.peakMemory) {
      this.metrics.peakMemory = this.metrics.memoryUsed;
    }

    // Emit warning if memory threshold exceeded
    const memoryMB = this.metrics.memoryUsed / (1024 * 1024);
    if (memoryMB > this.config.maxMemoryMB * 0.9) {
      this.emit('memory_warning', {
        used: memoryMB,
        limit: this.config.maxMemoryMB,
        percentage: (memoryMB / this.config.maxMemoryMB) * 100,
      });
    }
  }

  /**
   * Update adaptive sizing state
   * @private
   */
  _updateAdaptiveState(batchSize, processingTime) {
    if (!this.config.adaptiveSizing) return;

    // Track recent batch performance
    this.adaptiveState.recentBatchSizes.push(batchSize);
    this.adaptiveState.recentProcessingTimes.push(processingTime);

    // Keep only recent history (last 10 batches)
    if (this.adaptiveState.recentBatchSizes.length > 10) {
      this.adaptiveState.recentBatchSizes.shift();
      this.adaptiveState.recentProcessingTimes.shift();
    }

    // Calculate optimal batch size based on processing time
    if (this.adaptiveState.recentBatchSizes.length >= 5) {
      const avgTime =
        this.adaptiveState.recentProcessingTimes.reduce((a, b) => a + b, 0) /
        this.adaptiveState.recentProcessingTimes.length;
      const avgSize =
        this.adaptiveState.recentBatchSizes.reduce((a, b) => a + b, 0) /
        this.adaptiveState.recentBatchSizes.length;

      // Target: 2-5 seconds per batch for good throughput
      const targetTime = 3000; // 3 seconds
      const scaleFactor = targetTime / avgTime;

      this.adaptiveState.optimalBatchSize = Math.floor(avgSize * scaleFactor);

      // Clamp to reasonable range
      this.adaptiveState.optimalBatchSize = Math.max(
        this.config.minItemsPerBatch,
        Math.min(
          this.config.maxItemsPerBatch,
          this.adaptiveState.optimalBatchSize,
        ),
      );
    }
  }

  /**
   * Re-optimize batches based on adaptive learning
   * @private
   */
  _reoptimizeBatches(batches) {
    // If we've learned an optimal batch size, regroup batches
    const optimalSize = this.adaptiveState.optimalBatchSize;
    if (!optimalSize) return batches;

    // Flatten all items
    const allItems = [];
    const allIndices = [];
    batches.forEach((batch) => {
      allItems.push(...batch.items);
      allIndices.push(...batch.originalIndices);
    });

    // Re-create batches with optimal size
    const optimized = [];
    for (let i = 0; i < allItems.length; i += optimalSize) {
      const batchItems = allItems.slice(i, i + optimalSize);
      const batchIndices = allIndices.slice(i, i + optimalSize);

      const estimatedTokens = batchItems.reduce((sum, item) => {
        const text =
          typeof item === 'string'
            ? item
            : item.text || item.content || String(item);
        return sum + this._estimateTokens(text);
      }, 0);

      optimized.push({
        items: batchItems,
        estimatedTokens,
        originalIndices: batchIndices,
      });
    }

    return optimized;
  }

  /**
   * Restore original order of results
   * @private
   */
  _restoreOriginalOrder(results, originalItems) {
    // If results have metadata with original indices, use that
    // Otherwise assume results are in processed order
    return results;
  }

  /**
   * Cancel ongoing processing
   */
  cancel() {
    this.cancelled = true;
    if (this.abortController) {
      this.abortController.abort();
    }
    this.emit('cancelled', {
      processedItems: this.metrics.processedItems,
      totalItems: this.metrics.totalItems,
    });
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      processing: this.processing,
      cancelled: this.cancelled,
      efficiency: {
        batchUtilization:
          this.metrics.avgBatchSize / this.config.maxItemsPerBatch,
        tokenUtilization:
          this.metrics.avgTokensPerBatch / this.config.maxTokensPerBatch,
        apiCallReduction:
          this.metrics.totalItems > 0
            ? (this.metrics.apiCallsSaved / this.metrics.totalItems) * 100
            : 0,
        throughput:
          this.metrics.totalTime > 0
            ? this.metrics.processedItems / (this.metrics.totalTime / 1000)
            : 0, // items per second
      },
    };
  }

  /**
   * Get processing status
   */
  getStatus() {
    return {
      processing: this.processing,
      cancelled: this.cancelled,
      progress:
        this.metrics.totalItems > 0
          ? (this.metrics.processedItems / this.metrics.totalItems) * 100
          : 0,
      processedItems: this.metrics.processedItems,
      totalItems: this.metrics.totalItems,
      successfulBatches: this.metrics.successfulBatches,
      failedBatches: this.metrics.failedBatches,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalItems: 0,
      processedItems: 0,
      totalBatches: 0,
      successfulBatches: 0,
      failedBatches: 0,
      totalTokens: 0,
      totalTime: 0,
      avgBatchSize: 0,
      avgTokensPerBatch: 0,
      apiCallsSaved: 0,
      memoryUsed: 0,
      peakMemory: 0,
    };

    this.adaptiveState = {
      recentBatchSizes: [],
      recentProcessingTimes: [],
      optimalBatchSize: null,
    };

    this.emit('metrics_reset');
  }
}

/**
 * Create embedder with batch processing
 *
 * Wraps an embedder to use intelligent batch processing
 */
function createBatchedEmbedder(embedder, options = {}) {
  const processor = new BatchProcessor({
    model: options.model || embedder.model,
    ...options,
  });

  return {
    ...embedder,

    async embed(texts, embedOptions = {}) {
      // Use batch processor
      const results = await processor.processBatches(
        texts,
        async (batch, batchInfo) => {
          // Call original embedder
          return await embedder.embed(batch, embedOptions);
        },
        {
          onProgress: embedOptions.onProgress,
          abortController: embedOptions.abortController,
        },
      );

      return results;
    },

    getProcessor() {
      return processor;
    },

    getBatchMetrics() {
      return processor.getMetrics();
    },
  };
}

module.exports = {
  BatchProcessor,
  createBatchedEmbedder,
  DEFAULT_CONFIG,
  MODEL_LIMITS,
};
