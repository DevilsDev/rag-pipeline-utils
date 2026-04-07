'use strict';

/**
 * Streaming Embeddings Generator
 *
 * Async generator that yields embeddings chunk by chunk with backpressure
 * support. Processes documents in configurable batches while monitoring
 * memory usage to prevent OOM conditions in large-scale pipelines.
 *
 * Features:
 * - Batch-based document embedding with configurable size
 * - Memory-aware backpressure (pauses when heap exceeds threshold)
 * - Per-batch error isolation (failures don't abort the stream)
 * - Progress tracking via yielded metadata
 * - Support for both `.embed()` and `.embedQuery()` embedder APIs
 *
 * @module streaming/embedding-stream
 * @since 2.5.0
 */

/**
 * Default configuration for the embedding stream
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
 * Delay helper that resolves after the given milliseconds.
 *
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 * @private
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns current heap usage in megabytes.
 *
 * @returns {number} Heap used in MB
 * @private
 */
function heapUsedMB() {
  return process.memoryUsage().heapUsed / (1024 * 1024);
}

/**
 * Validates that the provided embedder exposes a supported embedding method.
 *
 * @param {Object} embedder - The embedder instance to validate
 * @throws {TypeError} If the embedder lacks both `.embed()` and `.embedQuery()`
 * @private
 */
function validateEmbedder(embedder) {
  if (
    !embedder ||
    (typeof embedder.embed !== 'function' &&
      typeof embedder.embedQuery !== 'function')
  ) {
    throw new TypeError(
      'Embedder must expose an .embed() or .embedQuery() method',
    );
  }
}

/**
 * Embeds a single document using the best available method on the embedder.
 *
 * Prefers `.embed()` (which typically accepts an array and returns an array of
 * vectors) but falls back to `.embedQuery()` for single-document embedders.
 *
 * @param {Object} embedder - Embedder instance
 * @param {string} content - Text content to embed
 * @returns {Promise<number[]>} The embedding vector
 * @private
 */
async function embedOne(embedder, content) {
  if (typeof embedder.embed === 'function') {
    const result = await embedder.embed([content]);
    return Array.isArray(result) ? result[0] : result;
  }
  return embedder.embedQuery(content);
}

/**
 * Async generator that streams embedding results for a collection of documents.
 *
 * Documents are processed in batches of `batchSize`. Before each batch the
 * generator checks heap memory; when usage exceeds
 * `backpressureThreshold * maxMemoryMB` it pauses briefly and retries,
 * giving the GC time to reclaim memory.
 *
 * Each yielded value is an object containing the document id, the computed
 * vector, the document index, and a progress fraction (0-1).
 *
 * Errors within a batch are caught and yielded as objects with an `error`
 * property so that consumers can decide how to handle partial failures
 * without losing the rest of the stream.
 *
 * @param {Array<{id: string, content: string}>} documents - Documents to embed
 * @param {Object} embedder - Embedder with `.embed()` or `.embedQuery()`
 * @param {Object} [options] - Override any key from {@link DEFAULT_CONFIG}
 * @yields {{ id: string, vector: number[], index: number, progress: number }
 *          | { id: string, error: Error, index: number, progress: number }}
 *
 * @example
 *   const docs = [{ id: '1', content: 'hello' }, { id: '2', content: 'world' }];
 *   for await (const emb of createEmbeddingStream(docs, myEmbedder)) {
 *     console.log(emb.id, emb.vector.length);
 *   }
 */
async function* createEmbeddingStream(documents, embedder, options = {}) {
  // --- Validate inputs ---
  if (!Array.isArray(documents)) {
    throw new TypeError('documents must be an array');
  }
  validateEmbedder(embedder);

  const config = { ...DEFAULT_CONFIG, ...options };
  const total = documents.length;

  if (total === 0) {
    return;
  }

  const memoryLimit = config.backpressureThreshold * config.maxMemoryMB;

  // --- Process batches ---
  for (let batchStart = 0; batchStart < total; batchStart += config.batchSize) {
    const batchEnd = Math.min(batchStart + config.batchSize, total);
    const batch = documents.slice(batchStart, batchEnd);

    // --- Backpressure: wait while memory is above threshold ---
    let backpressureApplied = false;
    while (heapUsedMB() > memoryLimit) {
      backpressureApplied = true;
      await delay(100);
    }

    // --- Embed the batch (isolate errors per batch) ---
    try {
      // Attempt bulk embed if the embedder supports arrays natively
      if (typeof embedder.embed === 'function') {
        const contents = batch.map((doc) => doc.content || '');
        const vectors = await embedder.embed(contents);
        const vectorArray = Array.isArray(vectors) ? vectors : [vectors];

        for (let j = 0; j < batch.length; j++) {
          const globalIndex = batchStart + j;
          yield {
            id: batch[j].id,
            vector: vectorArray[j] || [],
            index: globalIndex,
            progress: (globalIndex + 1) / total,
            ...(backpressureApplied ? { backpressure: true } : {}),
          };
        }
      } else {
        // Fall back to embedQuery one at a time
        for (let j = 0; j < batch.length; j++) {
          const globalIndex = batchStart + j;
          const vector = await embedder.embedQuery(batch[j].content || '');
          yield {
            id: batch[j].id,
            vector,
            index: globalIndex,
            progress: (globalIndex + 1) / total,
            ...(backpressureApplied ? { backpressure: true } : {}),
          };
        }
      }
    } catch (err) {
      // Yield error entries for each document in the failed batch
      for (let j = 0; j < batch.length; j++) {
        const globalIndex = batchStart + j;
        yield {
          id: batch[j].id,
          error: err,
          index: globalIndex,
          progress: (globalIndex + 1) / total,
        };
      }
    }
  }
}

module.exports = { createEmbeddingStream, DEFAULT_CONFIG };
