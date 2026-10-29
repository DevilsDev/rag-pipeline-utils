'use strict';

/**
 * @devilsdev/rag-pipeline-utils/testing
 *
 * Deterministic, offline stand-ins for testing code that uses this library:
 * no network, no API keys, the same output on every run.
 *
 * - HashEmbedder: bag-of-words vectors from hashed words.
 * - EchoLLM: answers with the top retrieved document (or an answer you set)
 *   and records every call.
 * - fixtures: a few short policy documents.
 * - createTestPipeline(): a ready, indexed pipeline built from the above.
 */

const { createRagPipeline } = require('./core/create-pipeline');
const { MemoryRetriever } = require('./connectors/memory-retriever');

function throwIfAborted(signal) {
  if (signal && signal.aborted) {
    throw signal.reason || new Error('Aborted');
  }
}

/**
 * Deterministic embedder: hashed bag of words, L2-normalised. Texts that
 * share words get similar vectors, so retrieval ranks sensibly in tests.
 */
class HashEmbedder {
  /**
   * @param {Object} [options]
   * @param {number} [options.dimensions=256] - Vector length
   */
  constructor({ dimensions = 256 } = {}) {
    if (!Number.isInteger(dimensions) || dimensions < 1) {
      throw new Error('dimensions must be a positive integer');
    }
    this.dimensions = dimensions;
    this.metadata = {
      name: 'hash-embedder',
      version: '1.0.0',
      type: 'embedder',
    };
  }

  /** @private */
  _vector(text) {
    const vector = new Array(this.dimensions).fill(0);
    for (const word of String(text)
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) || []) {
      let hash = 2166136261;
      for (const ch of word) {
        hash ^= ch.codePointAt(0);
        hash = Math.imul(hash, 16777619) >>> 0;
      }
      // FNV-1a's low bits are weak (e.g. "above" and "vacation" agree in
      // their low 10 bits), so mix them (MurmurHash3 fmix32) before taking
      // the bucket.
      hash ^= hash >>> 16;
      hash = Math.imul(hash, 0x85ebca6b);
      hash ^= hash >>> 13;
      hash = Math.imul(hash, 0xc2b2ae35);
      hash ^= hash >>> 16;
      hash >>>= 0;
      // Signed feature hashing: the top bit picks the sign, so colliding
      // words cancel out on average instead of adding up.
      vector[hash % this.dimensions] += hash & 0x80000000 ? -1 : 1;
    }
    const norm = Math.hypot(...vector);
    return norm > 0 ? vector.map((v) => v / norm) : vector;
  }

  /**
   * @param {string} text
   * @param {{ signal?: AbortSignal }} [options]
   * @returns {Promise<number[]>}
   */
  async embed(text, { signal } = {}) {
    throwIfAborted(signal);
    return this._vector(text);
  }

  /**
   * Same as embed().
   * @param {string} text
   * @param {{ signal?: AbortSignal }} [options]
   * @returns {Promise<number[]>}
   */
  async embedQuery(text, options) {
    return this.embed(text, options);
  }

  /**
   * @param {string[]} texts
   * @param {{ signal?: AbortSignal }} [options]
   * @returns {Promise<number[][]>}
   */
  async embedBatch(texts, { signal } = {}) {
    throwIfAborted(signal);
    return texts.map((t) => this._vector(t));
  }
}

/**
 * LLM stand-in. Answers with `answer` (a string, or a function of the query
 * and documents), or else with the top document's content. Every call is
 * recorded in `calls`, so tests can assert on what the pipeline sent.
 */
class EchoLLM {
  /**
   * @param {Object} [options]
   * @param {string|function(string, Array<Object>): string} [options.answer]
   * @param {string} [options.fallback='No information found.'] - Answer when
   *   there are no documents and no `answer`
   */
  constructor({ answer, fallback = 'No information found.' } = {}) {
    this.answer = answer;
    this.fallback = fallback;
    /** @type {Array<{query: string, docs: Array<Object>, options: Object}>} */
    this.calls = [];
    this.metadata = { name: 'echo-llm', version: '1.0.0', type: 'llm' };
  }

  /** @private */
  _answer(query, docs) {
    if (typeof this.answer === 'function')
      return String(this.answer(query, docs));
    if (typeof this.answer === 'string') return this.answer;
    const top = docs && docs[0];
    if (!top) return this.fallback;
    return typeof top === 'string'
      ? top
      : String(top.content ?? top.text ?? '');
  }

  /**
   * @param {string} query
   * @param {Array<Object>} [docs]
   * @param {{ signal?: AbortSignal }} [options]
   * @returns {Promise<string>}
   */
  async generate(query, docs = [], options = {}) {
    throwIfAborted(options.signal);
    this.calls.push({ query, docs, options });
    return this._answer(query, docs);
  }

  /**
   * Streams the same answer word by word, then a done chunk.
   * @param {string} query
   * @param {Array<Object>} [docs]
   * @param {{ signal?: AbortSignal }} [options]
   * @yields {{ token: string, done: boolean }}
   */
  async *generateStream(query, docs = [], options = {}) {
    throwIfAborted(options.signal);
    this.calls.push({ query, docs, options, stream: true });
    for (const token of this._answer(query, docs).split(/(?<= )/)) {
      throwIfAborted(options.signal);
      yield { token, done: false };
    }
    yield { token: '', done: true };
  }
}

/** Short documents for tests and examples. */
const fixtures = Object.freeze({
  documents: Object.freeze([
    Object.freeze({
      id: 'vacation',
      content:
        'Full-time employees receive twenty days of paid vacation per year. Unused days carry over to March.',
      metadata: Object.freeze({ source: 'vacation.md' }),
    }),
    Object.freeze({
      id: 'remote-work',
      content:
        'Employees may work remotely up to three days per week with manager approval.',
      metadata: Object.freeze({ source: 'remote-work.md' }),
    }),
    Object.freeze({
      id: 'expenses',
      content:
        'Submit receipts within thirty days. Travel above 500 EUR needs pre-approval from finance.',
      metadata: Object.freeze({ source: 'expenses.md' }),
    }),
  ]),
});

/**
 * A pipeline with HashEmbedder, a MemoryRetriever already holding
 * `documents`, and EchoLLM (or the llm you pass).
 *
 * @example
 * const { createTestPipeline } = require('@devilsdev/rag-pipeline-utils/testing');
 * const { pipeline, llm } = await createTestPipeline();
 * const result = await pipeline.run({ query: 'How many vacation days?' });
 * // result.results[0].id === 'vacation'; llm.calls.length === 1
 *
 * @param {Object} [options]
 * @param {Array<{id: string, content: string, metadata?: Object}>} [options.documents=fixtures.documents]
 * @param {Object} [options.embedder] - Defaults to a new HashEmbedder
 * @param {Object|null} [options.llm] - Defaults to a new EchoLLM; null for retrieval only
 * @param {Object} [options.pipeline] - Extra createRagPipeline options (e.g. reranker)
 * @returns {Promise<{ pipeline: Object, embedder: Object, retriever: MemoryRetriever, llm: Object|null }>}
 */
async function createTestPipeline({
  documents = fixtures.documents,
  embedder = new HashEmbedder(),
  llm = new EchoLLM(),
  pipeline: pipelineOptions = {},
} = {}) {
  const retriever = new MemoryRetriever();
  const vectors = await Promise.all(
    documents.map((d) => embedder.embed(d.content)),
  );
  await retriever.store(
    documents.map((d, i) => ({
      ...d,
      metadata: { ...(d.metadata || {}) },
      vector: vectors[i],
    })),
  );
  const pipeline = createRagPipeline({
    ...pipelineOptions,
    embedder,
    retriever,
    ...(llm && { llm }),
  });
  return { pipeline, embedder, retriever, llm: llm || null };
}

module.exports = { HashEmbedder, EchoLLM, fixtures, createTestPipeline };
