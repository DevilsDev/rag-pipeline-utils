"use strict";

const { EventEmitter } = require("events");
const { sentenceChunk } = require("./strategies/sentence");
const { fixedSizeChunk } = require("./strategies/fixed-size");
const { recursiveChunk } = require("./strategies/recursive");
const { semanticChunk } = require("./strategies/semantic");
const { structureAwareChunk } = require("./strategies/structure-aware");

/**
 * Default configuration for the chunking engine.
 * @type {object}
 */
const DEFAULT_CONFIG = {
  strategy: "recursive",
  chunkSize: 512,
  chunkOverlap: 50,
  minChunkSize: 50,
  separators: ["\n\n", "\n", ". ", " "],
  similarityThreshold: 0.3,
};

/**
 * ChunkingEngine orchestrates text chunking using pluggable strategies.
 * Extends EventEmitter to emit 'chunk' events after each chunking operation.
 *
 * @extends EventEmitter
 */
class ChunkingEngine extends EventEmitter {
  /**
   * Create a ChunkingEngine instance.
   *
   * @param {object} [options={}] - Configuration options merged with DEFAULT_CONFIG.
   * @param {string} [options.strategy='recursive'] - Default strategy name.
   * @param {number} [options.chunkSize=512] - Default chunk size.
   * @param {number} [options.chunkOverlap=50] - Default chunk overlap.
   * @param {number} [options.minChunkSize=50] - Default minimum chunk size.
   * @param {string[]} [options.separators] - Default separators for recursive strategy.
   * @param {number} [options.similarityThreshold=0.3] - Default similarity threshold for semantic strategy.
   */
  constructor(options = {}) {
    super();
    this._config = { ...DEFAULT_CONFIG, ...options };
    this._strategies = new Map();

    // Register built-in strategies
    this._strategies.set("sentence", sentenceChunk);
    this._strategies.set("fixed-size", fixedSizeChunk);
    this._strategies.set("recursive", recursiveChunk);
    this._strategies.set("semantic", semanticChunk);
    this._strategies.set("structure-aware", structureAwareChunk);
  }

  /**
   * Chunk text using the configured or specified strategy.
   *
   * @param {string} text - The input text to chunk. Must be a non-empty string.
   * @param {object} [options={}] - Per-call options that override the engine config.
   * @param {string} [options.strategy] - Strategy name to use for this call.
   * @returns {string[]} Array of text chunks.
   * @throws {Error} If text is not a non-empty string.
   * @throws {Error} If the specified strategy is not registered.
   * @fires ChunkingEngine#chunk
   */
  chunk(text, options = {}) {
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      throw new Error("text must be a non-empty string");
    }

    const mergedOptions = { ...this._config, ...options };
    const strategyName = mergedOptions.strategy;

    const strategyFn = this._strategies.get(strategyName);
    if (!strategyFn) {
      throw new Error(
        `Unknown chunking strategy "${strategyName}". Available strategies: ${this.listStrategies().join(", ")}`,
      );
    }

    const results = strategyFn(text, mergedOptions);

    // Filter out empty chunks
    const chunks = results.filter((chunk) => chunk && chunk.trim().length > 0);

    /**
     * Chunk event emitted after a successful chunking operation.
     *
     * @event ChunkingEngine#chunk
     * @type {object}
     * @property {string} strategy - The strategy name used.
     * @property {number} inputLength - Character length of the input text.
     * @property {number} chunkCount - Number of resulting chunks.
     */
    this.emit("chunk", {
      strategy: strategyName,
      inputLength: text.length,
      chunkCount: chunks.length,
    });

    return chunks;
  }

  /**
   * Register a custom chunking strategy.
   *
   * @param {string} name - Strategy name (used to select it via options.strategy).
   * @param {function} fn - Strategy function with signature (text, options) => string[].
   * @throws {Error} If name is not a non-empty string.
   * @throws {Error} If fn is not a function.
   */
  registerStrategy(name, fn) {
    if (!name || typeof name !== "string") {
      throw new Error("Strategy name must be a non-empty string");
    }
    if (typeof fn !== "function") {
      throw new Error(
        "Strategy must be a function with signature (text, options) => string[]",
      );
    }
    this._strategies.set(name, fn);
  }

  /**
   * List all registered strategy names.
   *
   * @returns {string[]} Array of strategy names.
   */
  listStrategies() {
    return Array.from(this._strategies.keys());
  }

  /**
   * Get the current engine configuration.
   *
   * @returns {object} A copy of the current configuration.
   */
  getConfig() {
    return { ...this._config };
  }
}

module.exports = { ChunkingEngine, DEFAULT_CONFIG };
