'use strict';

async function createPipeline({
  loader,
  embedder,
  retriever,
  reranker,
  llm,
  evaluator,
} = {}) {
  // Required components check
  const required = ['loader', 'embedder', 'retriever', 'llm'];
  const missing = required.filter(
    (name) => !arguments[0] || !arguments[0][name],
  );
  if (missing.length > 0) {
    throw new Error(`Required components missing: ${missing.join(', ')}`);
  }

  return {
    async run(input, { signal } = {}) {
      // Check if signal is already aborted
      if (signal && signal.aborted) {
        throw new Error('Aborted');
      }

      // Execute pipeline in order
      const docs = await loader.load(input, { signal });
      const embeddings = await embedder.embed(docs, { signal });
      const candidates = await retriever.retrieve(embeddings, { signal });

      let ranked = candidates;
      if (reranker && typeof reranker.rerank === 'function') {
        ranked = await reranker.rerank(input, candidates, { signal });
      }

      const answer = await llm.generate(input, ranked, { signal });

      let evaluation = null;
      if (evaluator && typeof evaluator.evaluate === 'function') {
        evaluation = await evaluator.evaluate(input, answer, ranked);
      }

      return {
        docs,
        embeddings,
        candidates,
        ranked,
        answer,
        evaluation,
      };
    },
  };
}

// CJS+ESM interop pattern
module.exports = createPipeline;
module.exports.createPipeline = createPipeline;
module.exports.default = module.exports;
