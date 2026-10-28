'use strict';

/**
 * What each pipeline stage must provide, as createRagPipeline and the CLI
 * use it. A plugin needs at least one of `anyOf`; a missing `recommended`
 * method only matters for the command named in its note.
 *
 * Shared by validatePlugin() and the `rag-pipeline init` wizard. The
 * stricter rules pluginRegistry.register() applies (metadata, and the
 * methods in contracts/*.json) are checked by validatePlugin(..., {
 * registry: true }).
 */
const STAGE_CONTRACTS = Object.freeze({
  loader: {
    anyOf: ['load'],
    recommended: {},
  },
  embedder: {
    anyOf: ['embed', 'embedQuery'],
    recommended: { embed: '`ingest` calls embed() to embed documents' },
  },
  retriever: {
    anyOf: ['retrieve'],
    recommended: { store: '`ingest` calls store() to save vectors' },
  },
  reranker: {
    anyOf: ['rerank'],
    recommended: {},
  },
  llm: {
    anyOf: ['generate'],
    recommended: {},
  },
});

module.exports = { STAGE_CONTRACTS };
