'use strict';

/**
 * @devilsdev/rag-pipeline-utils/edge: the library without Node.js APIs, for
 * runtimes that only have Web APIs (Vercel Edge Functions, Cloudflare
 * Workers without nodejs_compat, Deno, Netlify Edge Functions, browsers).
 *
 * scripts/build.js bundles this file to dist/edge.mjs, with Node's crypto,
 * events and pino replaced by Web API versions (src/edge/). Left out: what
 * reads files or needs a Node server or package (config files, loaders,
 * FileVectorStore, PgVectorRetriever, OpenAIConnector, the plugin hub, the
 * dev server, the CLI). For OpenAI models, use createAiSdkAdapter with the
 * AI SDK's OpenAI provider.
 */

const { createRagPipeline } = require('./core/create-pipeline');
const { packContext } = require('./core/context-packing');
const errorFormatter = require('./utils/error-formatter');
const { retry, withRetry } = require('./utils/retry');

const {
  scoreAnswer,
  computeBLEU,
  computeROUGE,
  checkNumericConsistency,
  extractNumbers,
} = require('./evaluate/scoring');
const { computeFaithfulness } = require('./evaluate/faithfulness');
const { computeSemanticSimilarity } = require('./evaluate/semantic-similarity');
const { validateDataset } = require('./evaluate/dataset');
const { generateSyntheticDataset } = require('./evaluate/synthetic');
const { runEvaluation, compareConfigurations } = require('./evaluate/compare');
const {
  evaluationVerdict,
  renderEvaluationReport,
} = require('./evaluate/report');
const { computeAnswerRelevance } = require('./evaluate/relevance');
const {
  computeContextPrecision,
  computeContextRecall,
} = require('./evaluate/context-metrics');
const { computeGroundedness } = require('./evaluate/groundedness');
const { PipelineEvaluator } = require('./evaluate/pipeline-evaluator');

const { ChunkingEngine } = require('./chunking/chunking-engine');
const { CitationTracker } = require('./citation/citation-tracker');
const { checkAnswer, normalizeSources } = require('./grounding/check-answer');
const { createAiSdkAdapter } = require('./adapters/ai-sdk');
const { MemoryCache } = require('./cache/memory-cache');
const { RedisCache } = require('./cache/redis-cache');
const {
  mapSentenceToSources,
  buildIDFWeights,
} = require('./citation/source-mapper');
const { detectHallucinations } = require('./citation/hallucination-detector');

const { BM25Search } = require('./retrieval/bm25-search');
const { reciprocalRankFusion } = require('./retrieval/rank-fusion');
const { HybridRetriever } = require('./retrieval/hybrid-retriever');

const { PreRetrievalGuard } = require('./guardrails/pre-retrieval-guard');
const { detectInjection } = require('./guardrails/injection-detector');
const { RetrievalGuard } = require('./guardrails/retrieval-guard');
const { PostGenerationGuard } = require('./guardrails/post-generation-guard');
const { GuardrailsPipeline } = require('./guardrails/guardrails-pipeline');

const { QueryPlanner } = require('./agentic/query-planner');
const { IterativeRetriever } = require('./agentic/iterative-retriever');
const { SelfCritiqueChecker } = require('./agentic/self-critique');
const { AgenticPipeline } = require('./agentic/agentic-pipeline');

const { CostCalculator, PRICING_METADATA } = require('./cost/cost-calculator');
const { CostTracker } = require('./cost/cost-tracker');
const { TokenBudget } = require('./cost/token-budget');
const { createModelRouter, classifyQuery } = require('./cost/model-router');

const { BaseConnector } = require('./connectors/base-connector');
const { OllamaConnector } = require('./connectors/ollama-connector');
const { LocalEmbedder } = require('./connectors/local-embedder');
const { MemoryRetriever } = require('./connectors/memory-retriever');
const { QdrantRetriever } = require('./retrieval/qdrant-retriever');
const { AnthropicConnector } = require('./connectors/anthropic-connector');
const { CohereConnector } = require('./connectors/cohere-connector');

const { ScoringReranker } = require('./reranker/scoring-reranker');
const { EmbeddingReranker } = require('./reranker/embedding-reranker');
const { CascadeReranker } = require('./reranker/cascade-reranker');

module.exports = {
  // Core API
  createRagPipeline,
  createPipeline: createRagPipeline,
  packContext,

  // Utilities
  createError: errorFormatter.createError,
  wrapError: errorFormatter.wrapError,
  ERROR_CODES: errorFormatter.ERROR_CODES,
  retry,
  withRetry,

  // Evaluation
  scoreAnswer,
  computeBLEU,
  computeROUGE,
  checkNumericConsistency,
  extractNumbers,
  computeFaithfulness,
  computeSemanticSimilarity,
  validateDataset,
  generateSyntheticDataset,
  runEvaluation,
  compareConfigurations,
  evaluationVerdict,
  renderEvaluationReport,
  computeAnswerRelevance,
  computeContextPrecision,
  computeContextRecall,
  computeGroundedness,
  PipelineEvaluator,

  // Chunking
  ChunkingEngine,

  // Citation & Grounding
  CitationTracker,
  checkAnswer,
  normalizeSources,
  createAiSdkAdapter,
  MemoryCache,
  RedisCache,
  mapSentenceToSources,
  buildIDFWeights,
  detectHallucinations,

  // Hybrid Retrieval
  BM25Search,
  reciprocalRankFusion,
  HybridRetriever,

  // Guardrails
  PreRetrievalGuard,
  detectInjection,
  RetrievalGuard,
  PostGenerationGuard,
  GuardrailsPipeline,

  // Agentic RAG
  QueryPlanner,
  IterativeRetriever,
  SelfCritiqueChecker,
  AgenticPipeline,

  // Cost Management
  CostCalculator,
  PRICING_METADATA,
  CostTracker,
  TokenBudget,
  createModelRouter,
  classifyQuery,

  // Connectors
  BaseConnector,
  OllamaConnector,
  LocalEmbedder,
  MemoryRetriever,
  QdrantRetriever,
  AnthropicConnector,
  CohereConnector,

  // Reranking
  ScoringReranker,
  EmbeddingReranker,
  CascadeReranker,
};
