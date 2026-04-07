'use strict';

/**
 * Streaming Embedder
 *
 * Class wrapper that provides an EventEmitter interface around the
 * {@link module:streaming/embedding-stream createEmbeddingStream} async
 * generator.  Emits lifecycle events (`start`, `embedding`, `batch`,
 * `backpressure`, `done`, `error`) so that callers can monitor progress
 * without manually iterating the generator.
 *
 * Also exposes a convenience `embedAll()` method that collects every
 * embedding into an array, and tracks cumulative statistics across calls.
 *
 * @module streaming/streaming-embedder
 * @since 2.5.0
 */

const { EventEmitter } = require('events');
const { createEmbeddingStream } = require('./embedding-stream');

/**
 * Default configuration for the StreamingEmbedder
 * @type {Object}
 */
const DEFAULT_CONFIG = {
  /** @type {number} Number of documents per embedding batch */
  batchSize: 50,
  /** @type {number} Maximum concurrent batch operations */
  maxConcurrency: 3,
  /** @type {number} Maximum heap memory budget in megabytes */
  maxMemoryMB: 512,
  /** @type {number} Fraction of maxMemoryMB that triggers backpressure (0-1) */
  backpressureThreshold: 0.8,
};

/**
 * EventEmitter-based wrapper around {@link createEmbeddingStream}.
 *
 * @extends EventEmitter
 *
 * @fires StreamingEmbedder#start
 * @fires StreamingEmbedder#embedding
 * @fires StreamingEmbedder#batch
 * @fires StreamingEmbedder#backpressure
 * @fires StreamingEmbedder#done
 * @fires StreamingEmbedder#error
 *
 * @example
 *   const se = new StreamingEmbedder(myEmbedder, { batchSize: 25 });
 *   se.on('embedding', (e) => console.log(e.id, e.progress));
 *   se.on('done', (stats) => console.log('finished', stats));
 *   const all = await se.embedAll(documents);
 */
class StreamingEmbedder extends EventEmitter {
  /**
   * @param {Object} embedder - Embedder instance with `.embed()` or `.embedQuery()`
   * @param {Object} [options] - Override any key from {@link DEFAULT_CONFIG}
   */
  constructor(embedder, options = {}) {
    super();

    if (
      !embedder ||
      (typeof embedder.embed !== 'function' &&
        typeof embedder.embedQuery !== 'function')
    ) {
      throw new TypeError(
        'Embedder must expose an .embed() or .embedQuery() method',
      );
    }

    /** @type {Object} */
    this.embedder = embedder;

    /** @type {Object} */
    this.config = { ...DEFAULT_CONFIG, ...options };

    /** @type {{ processed: number, failed: number, totalTime: number }} */
    this.stats = { processed: 0, failed: 0, totalTime: 0 };
  }

  /**
   * Async generator that yields embeddings while emitting lifecycle events.
   *
   * @param {Array<{id: string, content: string}>} documents - Documents to embed
   * @yields {{ id: string, vector: number[], index: number, progress: number }}
   *
   * @fires StreamingEmbedder#start
   * @fires StreamingEmbedder#embedding
   * @fires StreamingEmbedder#batch
   * @fires StreamingEmbedder#backpressure
   * @fires StreamingEmbedder#done
   * @fires StreamingEmbedder#error
   */
  async *embedStream(documents) {
    if (!Array.isArray(documents)) {
      throw new TypeError('documents must be an array');
    }

    const startTime = Date.now();
    const documentCount = documents.length;

    /**
     * @event StreamingEmbedder#start
     * @type {{ documentCount: number }}
     */
    this.emit('start', { documentCount });

    let batchCount = 0;
    let itemsInCurrentBatch = 0;

    try {
      const stream = createEmbeddingStream(
        documents,
        this.embedder,
        this.config,
      );

      for await (const embedding of stream) {
        // Track backpressure events
        if (embedding.backpressure) {
          /**
           * @event StreamingEmbedder#backpressure
           * @type {{ index: number, progress: number }}
           */
          this.emit('backpressure', {
            index: embedding.index,
            progress: embedding.progress,
          });
        }

        // Track errors
        if (embedding.error) {
          this.stats.failed += 1;
          /**
           * @event StreamingEmbedder#error
           * @type {{ id: string, error: Error, index: number }}
           */
          this.emit('error', {
            id: embedding.id,
            error: embedding.error,
            index: embedding.index,
          });
        } else {
          this.stats.processed += 1;
        }

        /**
         * @event StreamingEmbedder#embedding
         * @type {{ id: string, vector?: number[], index: number, progress: number }}
         */
        this.emit('embedding', embedding);

        // Emit batch event every batchSize items
        itemsInCurrentBatch += 1;
        if (itemsInCurrentBatch >= this.config.batchSize) {
          batchCount += 1;
          /**
           * @event StreamingEmbedder#batch
           * @type {{ batchNumber: number, processedSoFar: number, progress: number }}
           */
          this.emit('batch', {
            batchNumber: batchCount,
            processedSoFar: embedding.index + 1,
            progress: embedding.progress,
          });
          itemsInCurrentBatch = 0;
        }

        yield embedding;
      }

      // Emit a final batch event for any remaining items
      if (itemsInCurrentBatch > 0) {
        batchCount += 1;
        this.emit('batch', {
          batchNumber: batchCount,
          processedSoFar: documentCount,
          progress: 1,
        });
      }
    } finally {
      const elapsed = Date.now() - startTime;
      this.stats.totalTime += elapsed;

      /**
       * @event StreamingEmbedder#done
       * @type {{ processed: number, failed: number, totalTime: number, documentCount: number }}
       */
      this.emit('done', {
        processed: this.stats.processed,
        failed: this.stats.failed,
        totalTime: this.stats.totalTime,
        documentCount,
      });
    }
  }

  /**
   * Convenience method that collects all embeddings into an array.
   *
   * @param {Array<{id: string, content: string}>} documents - Documents to embed
   * @returns {Promise<Array<{ id: string, vector: number[], index: number, progress: number }>>}
   */
  async embedAll(documents) {
    const results = [];
    for await (const embedding of this.embedStream(documents)) {
      results.push(embedding);
    }
    return results;
  }

  /**
   * Returns a snapshot of the cumulative statistics.
   *
   * @returns {{ processed: number, failed: number, totalTime: number }}
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Resets the cumulative statistics to zero.
   */
  resetStats() {
    this.stats = { processed: 0, failed: 0, totalTime: 0 };
  }
}

module.exports = { StreamingEmbedder, DEFAULT_CONFIG };
