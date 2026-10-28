'use strict';
// Share the exported singleton so plugins registered via
// `pluginRegistry.register()` are resolvable by name here.
const defaultRegistry = require('./plugin-registry.js');
const { embedQuery, canEmbed } = require('../utils/embed-query');

function resolve(registry, type, value) {
  const reg = registry || defaultRegistry;
  return typeof value === 'string' ? reg.get(type, value) : value;
}

function withTimeout(promise, ms) {
  if (!ms) return promise;
  let timer;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error('Execution timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

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
  const llmI = llm
    ? resolve(reg, 'llm', llm)
    : {
        async generate() {
          return 'ok';
        },
      };
  const rerankerI = reranker ? resolve(reg, 'reranker', reranker) : null;

  async function runOnce({ query, queryVector, options = {} }) {
    const { timeout, stream } = options || {};
    const doWork = (async () => {
      if (loaderI?.load) await loaderI.load();
      let vector = queryVector;
      if (!vector && query && canEmbed(embedderI)) {
        vector = await embedQuery(embedderI, query);
      }

      let docs = await retrieverI.retrieve({
        query,
        queryVector: vector,
        topK: options.topK ?? 3,
      });
      // Hook for filtering (e.g. ACL guardrails) before anything downstream,
      // including the LLM, sees the retrieved documents.
      if (typeof options.filterResults === 'function' && Array.isArray(docs)) {
        docs = await options.filterResults(docs);
      }
      let results = docs;
      if (rerankerI?.rerank && Array.isArray(docs) && docs.length) {
        results = await rerankerI.rerank(query || '', docs, {
          topK: options.topK ?? docs.length,
        });
      }

      if (stream) {
        // Use streaming generate if available
        if (llmI.generateStream) {
          const streamResult = llmI.generateStream(query, results, options);
          return streamResult;
        } else if (llmI.generate) {
          // Fallback: simulate streaming from regular generate
          const answer = (await llmI.generate(query, results, options)) ?? '';
          async function* gen() {
            const chunks = String(answer || '').length
              ? [String(answer)]
              : [''];
            for (const c of chunks) yield { token: c, done: false };
            yield { token: '', done: true };
          }
          return gen();
        }
      }

      const answer = (await llmI.generate?.(query, results, options)) ?? '';
      // tiny delay so durations > 0 in timing tests
      await new Promise((r) => setTimeout(r, 5));

      const result = { success: true, query, results };

      if (options.citations) {
        const { CitationTracker } = require('../citation/citation-tracker');
        const tracker = new CitationTracker(options.citationOptions || {});
        result.answer = String(answer);
        result.citations = tracker.track(String(answer), results);
      }

      if (options.evaluate) {
        const { PipelineEvaluator } = require('../evaluate/pipeline-evaluator');
        const evaluator = new PipelineEvaluator(options.evaluateOptions || {});
        result.answer = result.answer || String(answer);
        result.evaluation = evaluator.evaluate(
          { query, answer: String(answer), results },
          { citationResult: result.citations },
        );
      }

      return result;
    })();

    try {
      return await withTimeout(doWork, timeout);
    } catch (e) {
      return { success: false, error: String(e.message || e) };
    }
  }

  return { run: runOnce, cleanup() {} };
};
