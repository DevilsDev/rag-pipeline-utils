"use strict";

/**
 * Wraps pipeline components so the CLI can report per-stage timings
 * (`query --trace`) and see the retrieved passages when streaming (the
 * stream's final chunk carries citations, not results).
 *
 * Each wrapper forwards to the real component with `this` bound to it; only
 * the stage methods are timed.
 */

const { performance } = require("perf_hooks");

const STAGE_METHODS = {
  embedder: { embedQuery: "embed", embed: "embed" },
  retriever: { retrieve: "retrieve" },
  reranker: { rerank: "rerank" },
  llm: { generate: "generate", generateStream: "generate" },
};

async function* timedStream(source, record) {
  const start = performance.now();
  try {
    yield* await source;
  } finally {
    record(performance.now() - start);
  }
}

/**
 * @param {Object} components - { embedder, retriever, reranker, llm }
 * @returns {{ components: Object, timings: Array<{stage: string, ms: number}>, captured: { results: Array|null } }}
 */
function instrumentComponents(components) {
  const timings = [];
  const captured = { results: null };

  const wrap = (kind, component) => {
    if (!component) return component;
    const methods = STAGE_METHODS[kind];
    return new Proxy(component, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        const stage = methods[prop];
        if (typeof value !== "function" || !stage) return value;

        if (prop === "generateStream") {
          return (...args) =>
            timedStream(value.apply(target, args), (ms) =>
              timings.push({ stage, ms }),
            );
        }
        return async (...args) => {
          const start = performance.now();
          try {
            const out = await value.apply(target, args);
            if (kind === "retriever" || kind === "reranker") {
              // The reranker runs after the retriever, so its order wins.
              captured.results = out;
            }
            return out;
          } finally {
            timings.push({ stage, ms: performance.now() - start });
          }
        };
      },
    });
  };

  return {
    components: {
      ...components,
      embedder: wrap("embedder", components.embedder),
      retriever: wrap("retriever", components.retriever),
      reranker: wrap("reranker", components.reranker),
      llm: wrap("llm", components.llm),
    },
    timings,
    captured,
  };
}

module.exports = { instrumentComponents };
