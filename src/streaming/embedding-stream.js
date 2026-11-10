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
 * Embeds one document's text. The built-in embedders take a string, so a
 * string is what `embed()` gets; an embedder that only takes arrays (its
 * `embed()` says so) is called with a one-item array instead, and one that
 * only has `embedQuery()` gets that. `state.arrayOnly` remembers the array
 * form for the rest of the stream.
 *
 * @param {Object} embedder - Embedder instance
 * @param {string} content - Text content to embed
 * @param {{arrayOnly: boolean}} state - Per-stream embedder form
 * @returns {Promise<number[]>} The embedding vector
 * @private
 */
async function embedOne(embedder, content, state) {
  if (typeof embedder.embed !== 'function') {
    return embedder.embedQuery(content);
  }
  const first = (result) => (Array.isArray(result?.[0]) ? result[0] : result);
  if (state.arrayOnly) return first(await embedder.embed([content]));
  try {
    return await embedder.embed(content);
  } catch (err) {
    if (!/array/i.test(String(err && err.message))) throw err;
    state.arrayOnly = true;
    return first(await embedder.embed([content]));
  }
}

/**
 * Runs `fn` over `items` with at most `limit` calls in flight; resolves with
 * one `{ value }` or `{ error }` per item, in order.
 * @private
 */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { value: await fn(items[i], i) };
      } catch (error) {
        out[i] = { error };
      }
    }
  };
  const workers = Math.max(1, Math.min(limit || 1, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return out;
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

    // --- Embed the batch: embedBatch(texts) when the embedder has it,
    // otherwise one text at a time, maxConcurrency at a time. A document
    // that fails is reported on its own; the others carry on. ---
    const entry = (j, fields) => {
      const globalIndex = batchStart + j;
      return {
        id: batch[j].id,
        ...fields,
        index: globalIndex,
        progress: (globalIndex + 1) / total,
        ...(backpressureApplied && !fields.error ? { backpressure: true } : {}),
      };
    };
    const texts = batch.map((doc) => doc.content || '');

    if (typeof embedder.embedBatch === 'function') {
      try {
        const vectors = await embedder.embedBatch(texts);
        for (let j = 0; j < batch.length; j++) {
          const vector = Array.isArray(vectors) ? vectors[j] : undefined;
          yield vector
            ? entry(j, { vector })
            : entry(j, { error: new Error('Embedder returned no vector') });
        }
      } catch (err) {
        for (let j = 0; j < batch.length; j++) yield entry(j, { error: err });
      }
      continue;
    }

    const state = { arrayOnly: false };
    const settled = await mapLimit(texts, config.maxConcurrency, (text) =>
      embedOne(embedder, text, state),
    );
    for (let j = 0; j < batch.length; j++) {
      yield settled[j].error
        ? entry(j, { error: settled[j].error })
        : entry(j, { vector: settled[j].value });
    }
  }
}

module.exports = { createEmbeddingStream, DEFAULT_CONFIG };
