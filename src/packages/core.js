'use strict';

/**
 * @devilsdev/rag-core: createRagPipeline and what every other package
 * builds on (retrieval, reranking, caching, costs and routing). See
 * scripts/build-packages.js and packages/README.md.
 */

const { createRagPipeline } = require('../core/create-pipeline');
const { packContext } = require('../core/context-packing');
const errorFormatter = require('../utils/error-formatter');
const { retry, withRetry } = require('../utils/retry');
const { ChunkingEngine } = require('../chunking/chunking-engine');
const { BM25Search } = require('../retrieval/bm25-search');
const { reciprocalRankFusion } = require('../retrieval/rank-fusion');
const { HybridRetriever } = require('../retrieval/hybrid-retriever');
const { ScoringReranker } = require('../reranker/scoring-reranker');
const { EmbeddingReranker } = require('../reranker/embedding-reranker');
const { CascadeReranker } = require('../reranker/cascade-reranker');
const { MemoryCache } = require('../cache/memory-cache');
const { RedisCache } = require('../cache/redis-cache');
const { CostCalculator, PRICING_METADATA } = require('../cost/cost-calculator');
const { CostTracker } = require('../cost/cost-tracker');
const { TokenBudget } = require('../cost/token-budget');
const { createModelRouter, classifyQuery } = require('../cost/model-router');
const { MemoryRetriever } = require('../connectors/memory-retriever');
const { BaseConnector } = require('../connectors/base-connector');

module.exports = {
  createRagPipeline,
  createPipeline: createRagPipeline,
  packContext,
  createError: errorFormatter.createError,
  wrapError: errorFormatter.wrapError,
  ERROR_CODES: errorFormatter.ERROR_CODES,
  retry,
  withRetry,
  ChunkingEngine,
  BM25Search,
  reciprocalRankFusion,
  HybridRetriever,
  ScoringReranker,
  EmbeddingReranker,
  CascadeReranker,
  MemoryCache,
  RedisCache,
  CostCalculator,
  PRICING_METADATA,
  CostTracker,
  TokenBudget,
  createModelRouter,
  classifyQuery,
  MemoryRetriever,
  BaseConnector,
};
