'use strict';

const { EventEmitter } = require('events');
const { PreRetrievalGuard } = require('./pre-retrieval-guard');
const { RetrievalGuard } = require('./retrieval-guard');
const { PostGenerationGuard } = require('./post-generation-guard');

/**
 * Default configuration for the GuardrailsPipeline.
 * @type {object}
 */
const DEFAULT_CONFIG = {
  preRetrieval: {}, // PreRetrievalGuard options, or false to disable
  retrieval: {}, // RetrievalGuard options, or false to disable
  postGeneration: {}, // PostGenerationGuard options, or false to disable
  strict: false, // If true, block on any guard failure; if false, warn and continue
};

/**
 * Pipeline wrapper that applies all three guardrail layers (pre-retrieval,
 * retrieval, and post-generation) around an existing RAG pipeline. In strict
 * mode, any guard failure aborts the pipeline; otherwise issues are collected
 * as warnings and execution continues.
 *
 * @extends EventEmitter
 */
class GuardrailsPipeline extends EventEmitter {
  /**
   * @param {object} pipeline - The underlying RAG pipeline (must have a .run() method)
   * @param {object} [options] - Override default configuration
   * @param {object|false} [options.preRetrieval={}] - PreRetrievalGuard options, or false to disable
   * @param {object|false} [options.retrieval={}] - RetrievalGuard options, or false to disable
   * @param {object|false} [options.postGeneration={}] - PostGenerationGuard options, or false to disable
   * @param {boolean} [options.strict=false] - Whether to block on any guard failure
   */
  constructor(pipeline, options = {}) {
    super();

    if (!pipeline || typeof pipeline.run !== 'function') {
      throw new Error(
        'GuardrailsPipeline requires a pipeline with a .run() method',
      );
    }

    this.pipeline = pipeline;
    this.config = { ...DEFAULT_CONFIG, ...options };

    this.preGuard =
      this.config.preRetrieval !== false
        ? new PreRetrievalGuard(this.config.preRetrieval || {})
        : null;
    this.retrievalGuard =
      this.config.retrieval !== false
        ? new RetrievalGuard(this.config.retrieval || {})
        : null;
    this.postGuard =
      this.config.postGeneration !== false
        ? new PostGenerationGuard(this.config.postGeneration || {})
        : null;
  }

  /**
   * Run the full guarded pipeline.
   *
   * @param {object} input - Pipeline input
   * @param {string} input.query - The user query
   * @param {Float32Array} [input.queryVector] - Optional precomputed query vector
   * @param {object} [input.options] - Additional pipeline options
   * @param {object} [input.context] - Request context (e.g. userPermissions for ACL)
   * @returns {Promise<object>} Pipeline result with guardrails metadata attached
   */
  async run(input) {
    const guardrails = {
      preRetrieval: null,
      retrieval: null,
      postGeneration: null,
    };

    // 1. Pre-retrieval guard
    let query = input.query;
    if (this.preGuard) {
      guardrails.preRetrieval = this.preGuard.check(query);
      this.emit('preRetrieval', guardrails.preRetrieval);

      if (!guardrails.preRetrieval.safe && this.config.strict) {
        return {
          success: false,
          error: 'Pre-retrieval guard blocked query',
          guardrails,
        };
      }
      query = guardrails.preRetrieval.sanitizedQuery;
    }

    // 2. Run the underlying pipeline with (possibly sanitized) query
    const result = await this.pipeline.run({
      ...input,
      query,
      options: { ...input.options, citations: true },
    });

    // 3. Retrieval guard on results
    if (this.retrievalGuard && result.results) {
      guardrails.retrieval = this.retrievalGuard.filter(
        result.results,
        input.context,
      );
      this.emit('retrieval', guardrails.retrieval);
      result.results = guardrails.retrieval.results;
    }

    // 4. Post-generation guard on answer
    if (this.postGuard && result.answer) {
      guardrails.postGeneration = this.postGuard.check(
        result.answer,
        result.results,
      );
      this.emit('postGeneration', guardrails.postGeneration);

      if (!guardrails.postGeneration.safe && this.config.strict) {
        return {
          ...result,
          success: false,
          error: 'Post-generation guard flagged output',
          guardrails,
        };
      }
      result.answer = guardrails.postGeneration.sanitizedOutput;
    }

    result.guardrails = guardrails;
    return result;
  }
}

module.exports = { GuardrailsPipeline, DEFAULT_CONFIG };
