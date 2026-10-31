'use strict';
// Share the exported singleton so plugins registered via
// `pluginRegistry.register()` are resolvable by name here.
const defaultRegistry = require('./plugin-registry.js');
const { embedQuery, canEmbed } = require('../utils/embed-query');
const { packContext } = require('./context-packing');
const {
  createTelemetry,
  instrument,
  traceRun,
} = require('../observability/otel');
const {
  normalizeCacheOption,
  PipelineCache,
} = require('../cache/pipeline-cache');
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
 * The done chunk carries `timing: { firstTokenMs, totalMs }`, both measured
 * from the start of run(): `firstTokenMs` is when the first non-empty token
 * arrived (null when none did).
 *
 * @param {AsyncIterable<object|string>} source
 * @param {object} params
 * @param {AbortSignal} params.signal
 * @param {((text: string) => object)|null} params.finalize
 * @param {number} params.startedAt - performance.now() at the start of run()
 * @param {() => void} params.onEnd
 */
async function* guardStream(source, { signal, finalize, startedAt, onEnd }) {
  let firstTokenMs = null;
  const timing = () => ({
    firstTokenMs,
    totalMs: performance.now() - startedAt,
  });
  try {
    let text = '';
    for await (const chunk of source) {
      if (signal.aborted) throw signal.reason;
      const token =
        typeof chunk === 'string' ? chunk : String(chunk?.token ?? '');
      if (token && firstTokenMs === null) {
        firstTokenMs = performance.now() - startedAt;
      }
      if (!finalize) {
        yield chunk && chunk.done ? { ...chunk, timing: timing() } : chunk;
        continue;
      }
      text += token;
      if (chunk && chunk.done) {
        if (token) yield { ...chunk, token, done: false };
        break;
      }
      yield chunk;
    }
    if (signal.aborted) throw signal.reason;
    if (finalize) {
      yield { token: '', done: true, ...finalize(text), timing: timing() };
    }
  } finally {
    onEnd();
  }
}

/**
 * Pass a stream through and report its text when it completed: it reached a
 * done chunk or its end, and the run was not aborted. A stream the consumer
 * stops reading early is not reported, so a partial answer is never cached.
 */
async function* reportWhenComplete(source, signal, onComplete) {
  let text = '';
  let completed = false;
  try {
    for await (const chunk of source) {
      text += typeof chunk === 'string' ? chunk : String(chunk?.token ?? '');
      if (chunk && chunk.done) completed = true;
      yield chunk;
    }
    completed = true;
  } finally {
    if (completed && !signal.aborted) await onComplete(text);
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
 * - `stream`: return an async iterable of `{ token, done }` chunks; the
 *   done chunk carries `timing: { firstTokenMs, totalMs }`
 * - `citations`, `citationOptions`, `evaluate`, `evaluateOptions`,
 *   `referenceAnswer` (ground truth for context recall)
 * - `filterResults(docs)`: hook applied after retrieval
 *
 * A successful result carries `timing: { totalMs }`, measured from the start
 * of run().
 *
 * `cache` (factory option): `true`, a CacheBackend, or
 * `{ embeddings, retrieval, generation, ttlSeconds }` - see
 * src/cache/pipeline-cache.js. Results then carry `cache: { embeddings,
 * retrieval, generation }` ('hit', 'miss' or 'skip'), and the pipeline has
 * `cacheStats()`.
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
  cache,
  telemetry,
} = {}) {
  const reg = registry || defaultRegistry;
  // Fails here, not on the first run, when @opentelemetry/api is missing.
  const tel = createTelemetry(telemetry);
  const loaderI = loader ? resolve(reg, 'loader', loader) : null;
  let embedderI = embedder ? resolve(reg, 'embedder', embedder) : null;
  let retrieverI = retriever
    ? resolve(reg, 'retriever', retriever)
    : {
        async retrieve() {
          return [];
        },
      };
  let llmI = llm ? resolve(reg, 'llm', llm) : null;
  let rerankerI = reranker ? resolve(reg, 'reranker', reranker) : null;

  const cacheLayers = normalizeCacheOption(cache);
  const pc = cacheLayers
    ? new PipelineCache(cacheLayers, {
        embedder: embedderI,
        // The default stand-in retriever returns nothing; never cache it.
        retriever: retriever ? retrieverI : null,
        llm: llmI,
      })
    : null;

  // With telemetry, stage calls run in spans. The cache above keeps the
  // unwrapped components for its keys.
  if (tel) {
    embedderI = instrument(tel, 'embedder', embedderI);
    if (retriever) retrieverI = instrument(tel, 'retriever', retrieverI);
    rerankerI = instrument(tel, 'reranker', rerankerI);
    llmI = instrument(tel, 'llm', llmI);
  }

  async function runOnce({ query, queryVector, options = {} } = {}) {
    const opts = options || {};
    const { timeout, stream } = opts;
    const startedAt = performance.now();
    const run = createRunAbort({ timeout, signal: opts.signal });
    const { signal } = run;
    let streaming = false;

    // Per-run cache outcome per layer: 'hit', 'miss' or 'skip'.
    const cacheStatus = {};
    let packing;
    const withCache = (result) => {
      const out = pc ? { ...result, cache: { ...cacheStatus } } : result;
      const timing = { totalMs: performance.now() - startedAt };
      return packing ? { ...out, packing, timing } : { ...out, timing };
    };

    const doWork = (async () => {
      run.throwIfAborted();
      if (loaderI?.load) {
        await loaderI.load();
        run.throwIfAborted();
      }
      let vector = queryVector;
      if (!vector && query && canEmbed(embedderI)) {
        const key = pc && pc.embeddingKey(query);
        vector = pc && (await pc.get('embeddings', key, cacheStatus));
        if (!vector) {
          vector = await embedQuery(embedderI, query, { signal });
          run.throwIfAborted();
          if (pc) await pc.set('embeddings', key, vector);
        }
        run.throwIfAborted();
      }

      // Raw retriever output is cached before filterResults (guardrail ACLs)
      // and the reranker, so both still run on every request.
      const topK = opts.topK ?? 3;
      const retrievalKey =
        pc && pc.retrievalKey({ query, queryVector: vector, topK });
      let docs = pc && (await pc.get('retrieval', retrievalKey, cacheStatus));
      if (!docs) {
        docs = await retrieverI.retrieve({
          query,
          queryVector: vector,
          topK,
          signal,
        });
        run.throwIfAborted();
        if (pc && Array.isArray(docs)) {
          await pc.set('retrieval', retrievalKey, docs);
        }
      }
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
      // Fit the documents the LLM will see into the token budget. Packing
      // copies what it cuts, so cached retrieval results stay whole.
      if (opts.maxContextTokens != null && Array.isArray(results)) {
        const packed = packContext(results, {
          maxTokens: opts.maxContextTokens,
          countTokens: opts.countTokens,
        });
        results = packed.documents;
        packing = {
          tokens: packed.tokens,
          maxTokens: packed.maxTokens,
          kept: packed.kept,
          dropped: packed.dropped,
          truncated: packed.truncated,
        };
      }

      const genOptions = { ...opts, signal };
      const wantsQuality = Boolean(opts.citations || opts.evaluate);
      const generationKey =
        pc && llmI
          ? pc.generationKey({ query, docs: results, options: opts })
          : null;
      const cachedAnswer =
        pc && llmI
          ? await pc.get('generation', generationKey, cacheStatus)
          : undefined;
      run.throwIfAborted();

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
        } else if (typeof cachedAnswer === 'string') {
          source = (async function* cached() {
            yield { token: cachedAnswer, done: false };
            yield { token: '', done: true };
          })();
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
        if (source && packing) {
          const quality = finalize;
          finalize = (text) => ({ ...(quality ? quality(text) : {}), packing });
        }
        if (source) {
          run.throwIfAborted();
          streaming = true;
          if (pc && llmI && generationKey && typeof cachedAnswer !== 'string') {
            source = reportWhenComplete(source, signal, (text) =>
              pc.set('generation', generationKey, text),
            );
          }
          return guardStream(source, {
            signal,
            finalize,
            startedAt,
            onEnd: run.detach,
          });
        }
      }

      if (!llmI) {
        return withCache({
          success: true,
          query,
          results,
          answer: null,
          ...computeQuality({ query, answer: null, results, options: opts }),
        });
      }

      let answer;
      if (typeof cachedAnswer === 'string') {
        answer = cachedAnswer;
      } else {
        const raw = (await llmI.generate?.(query, results, genOptions)) ?? '';
        run.throwIfAborted();
        answer = String(raw);
        if (pc) await pc.set('generation', generationKey, answer);
        run.throwIfAborted();
      }

      return withCache({
        success: true,
        query,
        results,
        answer,
        ...computeQuality({ query, answer, results, options: opts }),
      });
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

  return {
    run: tel ? traceRun(tel, runOnce) : runOnce,
    cleanup() {},
    /** Cache hits, misses and skips per layer; null when caching is off. */
    cacheStats() {
      return pc ? pc.stats() : null;
    },
  };
};
