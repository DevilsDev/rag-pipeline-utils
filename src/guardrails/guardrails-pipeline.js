'use strict';

const { EventEmitter } = require('events');
const { PreRetrievalGuard } = require('./pre-retrieval-guard');
const { RetrievalGuard } = require('./retrieval-guard');
const { PostGenerationGuard } = require('./post-generation-guard');
const { detectedText } = require('./detectors');
const { createRunAbort } = require('../utils/run-abort');

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
 * Characters buffered from a stream when the output guard sets no
 * maxResponseLength (0 disables it). Past this the source is closed and the
 * answer counts as over-long.
 */
const DEFAULT_MAX_STREAM_CHARS = 1000000;

const RETRIEVAL_SKIPPED_REASON =
  'retrieval guard could not run: the wrapped pipeline neither called filterResults nor returned results; answer withheld';

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

function isAsyncIterable(value) {
  return (
    value != null &&
    typeof value === 'object' &&
    typeof value[Symbol.asyncIterator] === 'function'
  );
}

/**
 * The guard summaries of a withheld response: counts, kinds and reasons stay;
 * the answer, the query text, matched strings and document content do not.
 *
 * @param {object} guardrails
 * @returns {object}
 */
function withheldSummary(guardrails) {
  const out = { ...guardrails };
  if (out.preRetrieval) {
    const { sanitizedQuery, injection, ...rest } = out.preRetrieval;
    out.preRetrieval = {
      ...rest,
      ...(injection && {
        injection: {
          detected: injection.detected,
          matches: (injection.matches || []).map((m) => ({ id: m && m.id })),
        },
      }),
    };
  }
  if (out.retrieval && Array.isArray(out.retrieval.results)) {
    const { results, ...rest } = out.retrieval;
    out.retrieval = {
      ...rest,
      removed: (rest.removed || []).map((doc) => ({ id: doc && doc.id })),
    };
  }
  if (out.postGeneration) {
    out.postGeneration = { ...out.postGeneration, sanitizedOutput: '' };
  }
  return out;
}

/** @returns {{success: false, error: string, guardrails: object}} */
function withheld(error, guardrails) {
  return { success: false, error, guardrails: withheldSummary(guardrails) };
}

/**
 * Read a token stream until its done chunk, its end, or `maxChars`
 * characters. Stops, and closes the source, when the signal aborts or the
 * timeout (ms) elapses; those reject like a pipeline run does.
 *
 * @returns {Promise<{text: string, done: object|null, overflow: boolean}>}
 *   The answer and the source's done chunk (without its token)
 */
async function collectStream(source, { signal, timeout, maxChars }) {
  const iterator = source[Symbol.asyncIterator]();
  const run = createRunAbort({ timeout, signal });
  let text = '';
  let done = null;
  let overflow = false;
  try {
    for (;;) {
      const next = await run.race(iterator.next());
      if (next.done) break;
      const chunk = next.value;
      text +=
        typeof chunk === 'string'
          ? chunk
          : String((chunk && chunk.token) ?? '');
      if (chunk && typeof chunk === 'object' && chunk.done) {
        const { token, ...rest } = chunk;
        done = rest;
        break;
      }
      if (text.length > maxChars) {
        overflow = true;
        break;
      }
    }
  } catch (error) {
    // A stalled source never settles return(); don't wait for it.
    if (iterator.return) Promise.resolve(iterator.return()).catch(() => {});
    throw error;
  } finally {
    run.cleanup();
  }
  if (iterator.return) await Promise.resolve(iterator.return()).catch(() => {});
  return { text, done, overflow };
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
   * With `options.stream` and a post-generation guard, the token stream is
   * buffered, checked and redacted as a whole, then released as an async
   * iterable: one token chunk with the sanitized answer, then a done chunk
   * carrying the redacted citations/evaluation and the `guardrails` summary.
   * A strict-mode block yields only a done chunk with `success: false`.
   *
   * @param {object} input - Pipeline input
   * @param {string} input.query - The user query
   * @param {Float32Array} [input.queryVector] - Optional precomputed query vector
   * @param {object} [input.options] - Additional pipeline options
   * @param {object} [input.context] - Request context (e.g. userPermissions for ACL)
   * @returns {Promise<object>} Pipeline result with guardrails metadata attached
   */
  async run(input) {
    const startedAt = Date.now();
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
        return withheld(
          withReasons(
            'Pre-retrieval guard blocked query',
            guardrails.preRetrieval,
          ),
          guardrails,
        );
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
    const streaming = isAsyncIterable(result);

    // 3. Retrieval guard on results
    if (this.retrievalGuard && preGenerationFilter) {
      guardrails.retrieval = summarizeFilter(preGenerationFilter);
      this.emit('retrieval', guardrails.retrieval);
    } else if (
      this.retrievalGuard &&
      !streaming &&
      result &&
      Array.isArray(result.results)
    ) {
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
        return withheld(
          'Retrieval guard removed access-controlled documents after generation; answer withheld',
          guardrails,
        );
      }
    } else if (
      this.retrievalGuard &&
      this._retrievalChecksActive() &&
      result &&
      (streaming ||
        result.answer ||
        (this.retrievalGuard.config.enforceACL && result.success !== false))
    ) {
      // The guard is configured but never saw a document: the wrapped
      // pipeline neither called filterResults nor returned results.
      guardrails.retrieval = {
        skipped: true,
        reason: RETRIEVAL_SKIPPED_REASON,
      };
      if (this.retrievalGuard.config.enforceACL || this.config.strict) {
        return withheld(RETRIEVAL_SKIPPED_REASON, guardrails);
      }
      this._warnRetrievalSkipped();
    }

    // 4. Post-generation guard on a streamed answer: buffer it, check it,
    // then release it through the same async-iterable interface.
    if (streaming && this.postGuard) {
      return this._releaseStream(result, {
        guardrails,
        callOptions,
        signal,
        timeout: this._remainingTimeout(input, startedAt),
        docs: preGenerationFilter ? preGenerationFilter.results : undefined,
      });
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
        return withheld(
          withReasons(
            'Post-generation guard flagged output',
            guardrails.postGeneration,
          ),
          guardrails,
        );
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
   * Whether the retrieval guard has a check that needs documents.
   * @private
   */
  _retrievalChecksActive() {
    const c = this.retrievalGuard.config;
    return Boolean(
      c.enforceACL ||
      c.detectInjection ||
      c.minRelevanceScore > 0 ||
      c.maxAgeDays > 0,
    );
  }

  /**
   * Milliseconds left of the caller's options.timeout, or undefined.
   * @private
   */
  _remainingTimeout(input, startedAt) {
    const t = input.options && input.options.timeout;
    if (typeof t !== 'number' || !(t > 0)) return undefined;
    return Math.max(1, t - (Date.now() - startedAt));
  }

  /** @private One warning per pipeline instance. */
  _warnRetrievalSkipped() {
    if (this._warnedRetrievalSkipped) return;
    this._warnedRetrievalSkipped = true;
    process.emitWarning(
      'GuardrailsPipeline: the retrieval guard was skipped because the wrapped pipeline neither called options.filterResults nor returned results. Call options.filterResults before generating, or return results.',
      { code: 'RAG_GUARDRAILS_RETRIEVAL_SKIPPED' },
    );
  }

  /**
   * Collect a token stream, run the post-generation guard on the whole
   * answer and return an async iterable that yields the sanitized answer as
   * one token chunk and then the done chunk. A blocked answer yields no
   * tokens, only a done chunk with the error.
   *
   * @private
   */
  async _releaseStream(
    source,
    { guardrails, callOptions, signal, timeout, docs },
  ) {
    const limit = this.postGuard.config.maxResponseLength;
    const maxChars = limit > 0 ? limit : DEFAULT_MAX_STREAM_CHARS;
    const { text, done, overflow } = await collectStream(source, {
      signal,
      timeout,
      maxChars,
    });
    let tokenChunk = null;
    let doneChunk;

    if (!text) {
      doneChunk = { ...done, token: '', done: true, guardrails };
    } else {
      const check = await this.postGuard.checkAsync(
        text,
        (done && done.results) || docs,
        callOptions,
      );
      if (overflow && check.safe) {
        // The guard sets no length limit, so it did not flag the cut-off.
        check.safe = false;
        check.sanitizedOutput = check.sanitizedOutput.slice(0, maxChars);
        check.issues.push(
          `Output exceeds maximum length of ${maxChars} characters`,
        );
      }
      guardrails.postGeneration = check;
      this.emit('postGeneration', check);

      if (!check.safe && this.config.strict) {
        doneChunk = {
          token: '',
          done: true,
          ...withheld(
            withReasons('Post-generation guard flagged output', check),
            guardrails,
          ),
          ...(done && done.timing && { timing: done.timing }),
        };
      } else {
        const found = detectedText(check);
        const { citations, evaluation, ...rest } = done || {};
        doneChunk = {
          ...rest,
          token: '',
          done: true,
          ...(citations !== undefined && {
            citations: this._redactDeep(citations, found),
          }),
          ...(evaluation !== undefined && {
            evaluation: this._redactDeep(evaluation, found),
          }),
          guardrails,
        };
        if (check.sanitizedOutput) {
          tokenChunk = { token: check.sanitizedOutput, done: false };
        }
      }
    }

    const stream = (async function* released() {
      if (tokenChunk) yield tokenChunk;
      yield doneChunk;
    })();
    Object.defineProperty(stream, 'guardrails', {
      value: doneChunk.guardrails,
      enumerable: false,
    });
    return stream;
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
