'use strict';
// Share the exported singleton so plugins registered via
// `pluginRegistry.register()` are resolvable by name here.
const defaultRegistry = require('./plugin-registry.js');
const { embedQuery, canEmbed } = require('../utils/embed-query');
const { createRunAbort } = require('../utils/run-abort');

/** Metrics that only need the query, the retrieved docs and a reference. */
const RETRIEVAL_METRICS = ['contextPrecision', 'contextRecall'];

function resolve(registry, type, value) {
  const reg = registry || defaultRegistry;
  return typeof value === 'string' ? reg.get(type, value) : value;
}

/**
 * Citations and evaluation for one run. `answer` is null when no llm is
 * configured: citations are then skipped and evaluation is limited to the
 * retrieval metrics (context precision, and context recall when a reference
 * answer is given).
 *
 * @param {object} params
 * @param {string} params.query
 * @param {string|null} params.answer
 * @param {Array<object>} params.results
 * @param {object} params.options - Run options
 * @returns {{ citations?: object, evaluation?: object }}
 */
function computeQuality({ query, answer, results, options }) {
  const out = {};
  const docs = Array.isArray(results) ? results : [];

  if (options.citations && answer !== null) {
    const { CitationTracker } = require('../citation/citation-tracker');
    const tracker = new CitationTracker(options.citationOptions || {});
    out.citations = tracker.track(answer, docs);
  }

  if (options.evaluate) {
    const {
      PipelineEvaluator,
      DEFAULT_CONFIG,
    } = require('../evaluate/pipeline-evaluator');
    const evaluateOptions = options.evaluateOptions || {};
    let config = evaluateOptions;
    if (answer === null) {
      const metrics = evaluateOptions.metrics || DEFAULT_CONFIG.metrics;
      config = {
        ...evaluateOptions,
        metrics: metrics.filter((m) => RETRIEVAL_METRICS.includes(m)),
      };
    }
    const evaluator = new PipelineEvaluator(config);
    out.evaluation = evaluator.evaluate(
      { query, answer: answer ?? '', results: docs },
      {
        citationResult: out.citations,
        referenceAnswer:
          options.referenceAnswer ?? evaluateOptions.referenceAnswer,
      },
    );
  }

  return out;
}

/**
 * Pass a token stream through, stopping when the run's signal aborts. When
 * citations or evaluation were requested, the streamed answer is accumulated
 * and the stream ends with one final chunk
 * `{ token: '', done: true, citations?, evaluation? }` (the source's own done
 * chunk is replaced by it; a token it carried is emitted first).
 *
 * @param {AsyncIterable<object|string>} source
 * @param {object} params
 * @param {AbortSignal} params.signal
 * @param {((text: string) => object)|null} params.finalize
 * @param {() => void} params.onEnd
 */
async function* guardStream(source, { signal, finalize, onEnd }) {
  try {
    let text = '';
    for await (const chunk of source) {
      if (signal.aborted) throw signal.reason;
      if (!finalize) {
        yield chunk;
        continue;
      }
      const token =
        typeof chunk === 'string' ? chunk : String(chunk?.token ?? '');
      text += token;
      if (chunk && chunk.done) {
        if (token) yield { ...chunk, token, done: false };
        break;
      }
      yield chunk;
    }
    if (signal.aborted) throw signal.reason;
    if (finalize) yield { token: '', done: true, ...finalize(text) };
  } finally {
    onEnd();
  }
}

/**
 * Create a RAG pipeline: (embed) -> retrieve -> (filter) -> (rerank) ->
 * generate -> (citations, evaluation).
 *
 * `run({ query, queryVector, options })` options:
 * - `topK` (default 3)
 * - `timeout` (ms): aborts the run; resolves `{ success: false, error: 'Execution timeout' }`
 * - `signal` (AbortSignal): caller cancellation; resolves
 *   `{ success: false, error: 'Execution aborted' }` when it aborts
 * - `stream`: return an async iterable of `{ token, done }` chunks
 * - `citations`, `citationOptions`, `evaluate`, `evaluateOptions`,
 *   `referenceAnswer` (ground truth for context recall)
 * - `filterResults(docs)`: hook applied after retrieval
 *
 * Every component call receives the run's AbortSignal: `retriever.retrieve({
 * ..., signal })`, `embedder.embedQuery(text, { signal })` /
 * `embedder.embed(text, { signal })`, `reranker.rerank(query, docs, { topK,
 * signal })` and `llm.generate(query, docs, { ...options, signal })`.
 * Components that ignore it still work; the run settles on abort anyway and
 * no later stage starts.
 *
 * Without an llm the pipeline is retrieval-only: `answer` is null, citations
 * are skipped and evaluation covers the retrieval metrics only.
 */
module.exports.createRagPipeline = function createRagPipeline({
  registry,
  loader,
  embedder,
  retriever,
  llm,
  reranker,
} = {}) {
  const reg = registry || defaultRegistry;
  const loaderI = loader ? resolve(reg, 'loader', loader) : null;
  const embedderI = embedder ? resolve(reg, 'embedder', embedder) : null;
  const retrieverI = retriever
    ? resolve(reg, 'retriever', retriever)
    : {
        async retrieve() {
          return [];
        },
      };
  const llmI = llm ? resolve(reg, 'llm', llm) : null;
  const rerankerI = reranker ? resolve(reg, 'reranker', reranker) : null;

  async function runOnce({ query, queryVector, options = {} } = {}) {
    const opts = options || {};
    const { timeout, stream } = opts;
    const run = createRunAbort({ timeout, signal: opts.signal });
    const { signal } = run;
    let streaming = false;

    const doWork = (async () => {
      run.throwIfAborted();
      if (loaderI?.load) {
        await loaderI.load();
        run.throwIfAborted();
      }
      let vector = queryVector;
      if (!vector && query && canEmbed(embedderI)) {
        vector = await embedQuery(embedderI, query, { signal });
        run.throwIfAborted();
      }

      let docs = await retrieverI.retrieve({
        query,
        queryVector: vector,
        topK: opts.topK ?? 3,
        signal,
      });
      run.throwIfAborted();
      // Hook for filtering (e.g. ACL guardrails) before anything downstream,
      // including the LLM, sees the retrieved documents.
      if (typeof opts.filterResults === 'function' && Array.isArray(docs)) {
        docs = await opts.filterResults(docs);
        run.throwIfAborted();
      }
      let results = docs;
      if (rerankerI?.rerank && Array.isArray(docs) && docs.length) {
        results = await rerankerI.rerank(query || '', docs, {
          topK: opts.topK ?? docs.length,
          signal,
        });
        run.throwIfAborted();
      }

      const genOptions = { ...opts, signal };
      const wantsQuality = Boolean(opts.citations || opts.evaluate);

      if (stream) {
        let source;
        let finalize = wantsQuality
          ? (text) =>
              computeQuality({ query, answer: text, results, options: opts })
          : null;
        if (!llmI) {
          // Retrieval only: no tokens, one done chunk carrying the results.
          const quality = computeQuality({
            query,
            answer: null,
            results,
            options: opts,
          });
          source = (async function* noAnswer() {})();
          finalize = () => ({ results, ...quality });
        } else if (llmI.generateStream) {
          source = await llmI.generateStream(query, results, genOptions);
        } else if (llmI.generate) {
          // Fallback: simulate streaming from regular generate
          const answer =
            (await llmI.generate(query, results, genOptions)) ?? '';
          source = (async function* gen() {
            yield { token: String(answer || ''), done: false };
            yield { token: '', done: true };
          })();
        }
        if (source) {
          run.throwIfAborted();
          streaming = true;
          return guardStream(source, {
            signal,
            finalize,
            onEnd: run.detach,
          });
        }
      }

      if (!llmI) {
        return {
          success: true,
          query,
          results,
          answer: null,
          ...computeQuality({ query, answer: null, results, options: opts }),
        };
      }

      const raw = (await llmI.generate?.(query, results, genOptions)) ?? '';
      run.throwIfAborted();
      const answer = String(raw);

      return {
        success: true,
        query,
        results,
        answer,
        ...computeQuality({ query, answer, results, options: opts }),
      };
    })();

    try {
      return await run.race(doWork);
    } catch (e) {
      return { success: false, error: String(e?.message || e) };
    } finally {
      // The timeout covers the run up to the returned stream; a caller
      // signal keeps cancelling a stream until it finishes.
      run.clearTimer();
      if (!streaming) run.detach();
    }
  }

  return { run: runOnce, cleanup() {} };
};
