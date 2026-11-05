'use strict';

const { EventEmitter } = require('events');
const { PreRetrievalGuard } = require('./pre-retrieval-guard');
const { RetrievalGuard } = require('./retrieval-guard');
const { PostGenerationGuard } = require('./post-generation-guard');
const { detectedText } = require('./detectors');

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
 * Reduce removed documents to their ids so filtered-out (possibly
 * access-controlled) content is never returned to the caller.
 *
 * @param {{results: Array, removed: Array, metadata: object}} filterOutput
 * @returns {{results: Array, removed: Array<{id: *}>, metadata: object}}
 */
function summarizeFilter(filterOutput) {
  return {
    ...filterOutput,
    removed: filterOutput.removed.map((doc) => ({ id: doc.id })),
  };
}

/**
 * Pipeline wrapper that applies all three guardrail layers (pre-retrieval,
 * retrieval, and post-generation) around an existing RAG pipeline. In strict
 * mode, any guard failure aborts the pipeline; otherwise issues are collected
 * as warnings and execution continues.
 *
 * @extends EventEmitter
 */
/**
 * A strict-mode block's message with the guard's reasons, so the error says
 * why ("... flagged output: PII detected (email): 1 occurrence(s); ...").
 * The issues name kinds and counts, never the PII itself; the full list is
 * in result.guardrails.
 */
function withReasons(message, check) {
  const issues = (check && check.issues) || [];
  if (issues.length === 0) return message;
  const text = issues.map(String).join('; ');
  return `${message}: ${text.length > 300 ? `${text.slice(0, 297)}...` : text}`;
}

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
    // The run's AbortSignal reaches each detector, so a slow model detector
    // stops when the request does.
    const signal = input.options && input.options.signal;
    const callOptions = signal ? { signal } : {};
    if (this.preGuard) {
      guardrails.preRetrieval = await this.preGuard.checkAsync(
        query,
        callOptions,
      );
      this.emit('preRetrieval', guardrails.preRetrieval);

      if (!guardrails.preRetrieval.safe && this.config.strict) {
        return {
          success: false,
          error: withReasons(
            'Pre-retrieval guard blocked query',
            guardrails.preRetrieval,
          ),
          guardrails,
        };
      }
      query = guardrails.preRetrieval.sanitizedQuery;
    }

    // 2. Run the underlying pipeline with (possibly sanitized) query. The
    // retrieval guard is passed in as options.filterResults so it runs
    // between retrieval and generation (supported by createRagPipeline).
    let preGenerationFilter = null;
    const filterOptions = this.retrievalGuard
      ? {
          filterResults: async (docs) => {
            preGenerationFilter = await this.retrievalGuard.filterAsync(
              docs,
              input.context,
              callOptions,
            );
            return preGenerationFilter.results;
          },
        }
      : {};
    const result = await this.pipeline.run({
      ...input,
      query,
      options: { ...input.options, citations: true, ...filterOptions },
    });

    // 3. Retrieval guard on results
    if (this.retrievalGuard && preGenerationFilter) {
      guardrails.retrieval = summarizeFilter(preGenerationFilter);
      this.emit('retrieval', guardrails.retrieval);
    } else if (this.retrievalGuard && result.results) {
      // The wrapped pipeline ignored options.filterResults, so it generated
      // from unfiltered documents. Filtering now only fixes result.results;
      // if ACL removed anything the answer may contain restricted content.
      guardrails.retrieval = summarizeFilter(
        await this.retrievalGuard.filterAsync(
          result.results,
          input.context,
          callOptions,
        ),
      );
      this.emit('retrieval', guardrails.retrieval);
      result.results = guardrails.retrieval.results;

      if (guardrails.retrieval.metadata.reasons.acl) {
        return {
          success: false,
          error:
            'Retrieval guard removed access-controlled documents after generation; answer withheld',
          guardrails,
        };
      }
    }

    // 4. Post-generation guard on answer
    if (this.postGuard && result.answer) {
      guardrails.postGeneration = await this.postGuard.checkAsync(
        result.answer,
        result.results,
        callOptions,
      );
      this.emit('postGeneration', guardrails.postGeneration);

      if (!guardrails.postGeneration.safe && this.config.strict) {
        // Do not spread result: it carries the raw answer and citations.
        return {
          success: false,
          error: withReasons(
            'Post-generation guard flagged output',
            guardrails.postGeneration,
          ),
          guardrails,
        };
      }
      result.answer = guardrails.postGeneration.sanitizedOutput;
      // Detector findings are redacted from derived text too.
      const found = detectedText(guardrails.postGeneration);
      this._redactDeep(result.citations, found);
      this._redactDeep(result.evaluation, found);
    }

    result.guardrails = guardrails;
    return result;
  }

  /**
   * Citations and evaluation details copy sentences from the raw answer, so
   * scrub every string in them with the same PII patterns as the answer.
   *
   * @param {*} value - Object, array or string to redact in place
   * @param {string[]} [matches=[]] - Strings found by PII detectors, redacted too
   * @returns {*} The redacted value
   * @private
   */
  _redactDeep(value, matches = []) {
    if (typeof value === 'string') return this.postGuard.redact(value, matches);
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) {
        value[key] = this._redactDeep(value[key], matches);
      }
    }
    return value;
  }
}

module.exports = { GuardrailsPipeline, DEFAULT_CONFIG };
