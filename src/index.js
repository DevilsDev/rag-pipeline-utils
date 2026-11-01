/**
 * RAG Pipeline Utils - Public API
 * Main entry point for consumers of the library
 */

// Core pipeline functionality
const { createRagPipeline } = require('./core/create-pipeline');
const { packContext } = require('./core/context-packing');

// Configuration utilities
const { loadRagConfig } = require('./config/load-config');
const { validateRagrc } = require('./config/enhanced-ragrc-schema');
const { normalizeConfig } = require('./config/normalize-config');

// Plugin system
const pluginRegistry = require('./core/plugin-registry');
const { validatePlugin } = require('./core/validate-plugin');

// Utilities
const logger = require('./utils/logger');
const errorFormatter = require('./utils/error-formatter');
const { BatchProcessor } = require('./utils/batch-processor');
const RateLimiter = require('./utils/rate-limiter');
const { retry, withRetry } = require('./utils/retry');
const { ConnectionPoolManager } = require('./utils/connection-pool');

// Security
const { JWTValidator } = require('./security/jwt-validator');
const {
  PluginSignatureVerifier,
} = require('./security/plugin-signature-verifier');
const { validateInput } = require('./security/validator');

// DAG engine for complex workflows
const { DAG } = require('./dag/dag-engine');

// Evaluation
const { evaluateRagDataset } = require('./evaluate/evaluator');
const {
  scoreAnswer,
  computeBLEU,
  computeROUGE,
  checkNumericConsistency,
  extractNumbers,
} = require('./evaluate/scoring');
const { computeFaithfulness } = require('./evaluate/faithfulness');
const { computeAnswerRelevance } = require('./evaluate/relevance');
const {
  computeContextPrecision,
  computeContextRecall,
} = require('./evaluate/context-metrics');
const { computeGroundedness } = require('./evaluate/groundedness');
const { computeSemanticSimilarity } = require('./evaluate/semantic-similarity');
const { validateDataset } = require('./evaluate/dataset');
const { generateSyntheticDataset } = require('./evaluate/synthetic');
const { runEvaluation, compareConfigurations } = require('./evaluate/compare');
const {
  evaluationVerdict,
  renderEvaluationReport,
} = require('./evaluate/report');
const { PipelineEvaluator } = require('./evaluate/pipeline-evaluator');

// Chunking
const { ChunkingEngine } = require('./chunking/chunking-engine');

// Citation & Grounding
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

// Hybrid Retrieval
const { BM25Search } = require('./retrieval/bm25-search');
const { reciprocalRankFusion } = require('./retrieval/rank-fusion');
const { HybridRetriever } = require('./retrieval/hybrid-retriever');
const { FileVectorStore } = require('./retrieval/file-vector-store');

// Guardrails
const { PreRetrievalGuard } = require('./guardrails/pre-retrieval-guard');
const { detectInjection } = require('./guardrails/injection-detector');
const { RetrievalGuard } = require('./guardrails/retrieval-guard');
const { PostGenerationGuard } = require('./guardrails/post-generation-guard');
const { GuardrailsPipeline } = require('./guardrails/guardrails-pipeline');

// Agentic RAG
const { QueryPlanner } = require('./agentic/query-planner');
const { IterativeRetriever } = require('./agentic/iterative-retriever');
const { SelfCritiqueChecker } = require('./agentic/self-critique');
const { AgenticPipeline } = require('./agentic/agentic-pipeline');

// Cost Management
const { CostCalculator, PRICING_METADATA } = require('./cost/cost-calculator');
const { CostTracker } = require('./cost/cost-tracker');
const { TokenBudget } = require('./cost/token-budget');
const { createModelRouter, classifyQuery } = require('./cost/model-router');

// Pipeline Debugger
const { ExecutionTracer } = require('./debug/execution-tracer');
const { TraceInspector } = require('./debug/trace-inspector');

// MCP Integration
const { MCPServer } = require('./mcp/mcp-server');
const { MCPToolBuilder } = require('./mcp/mcp-tool-builder');

// Quick Start Templates
const { ProjectScaffolder } = require('./templates/scaffold');
const { TemplateRegistry } = require('./templates/template-registry');

// Streaming Adapters
const { SSEAdapter } = require('./streaming/sse-adapter');
const { WebSocketAdapter } = require('./streaming/websocket-adapter');
const { StreamRouter } = require('./streaming/stream-router');

// Connectors
const { BaseConnector } = require('./connectors/base-connector');
const { OllamaConnector } = require('./connectors/ollama-connector');
const { LocalEmbedder } = require('./connectors/local-embedder');
const { MemoryRetriever } = require('./connectors/memory-retriever');
const { PgVectorRetriever } = require('./retrieval/pgvector-retriever');
const { QdrantRetriever } = require('./retrieval/qdrant-retriever');
const { OpenAIConnector } = require('./connectors/openai-connector');
const { AnthropicConnector } = require('./connectors/anthropic-connector');
const { CohereConnector } = require('./connectors/cohere-connector');

// Streaming Embeddings
const { StreamingEmbedder } = require('./streaming/streaming-embedder');
const { createEmbeddingStream } = require('./streaming/embedding-stream');

// Advanced Reranking
const { ScoringReranker } = require('./reranker/scoring-reranker');
const { EmbeddingReranker } = require('./reranker/embedding-reranker');
const { CascadeReranker } = require('./reranker/cascade-reranker');

// GraphRAG
const { KnowledgeGraph } = require('./graph/knowledge-graph');
const { EntityExtractor } = require('./graph/entity-extractor');
const { GraphRetriever } = require('./graph/graph-retriever');
const { GraphIndex } = require('./graph/graph-index');

// Performance Dashboard
const { DashboardGenerator } = require('./dashboard/dashboard-generator');
const { MetricsAggregator } = require('./dashboard/metrics-aggregator');

// Performance and observability
const ParallelProcessor = require('./core/performance/parallel-processor');
const eventLogger = require('./core/observability/event-logger');
const metrics = require('./core/observability/metrics');

// Enterprise features
const { AuditLogger } = require('./enterprise/audit-logging');

// Ecosystem
const { PluginHub, PluginAnalytics } = require('./ecosystem/plugin-hub');
const {
  PluginAnalyticsDashboard,
} = require('./ecosystem/plugin-analytics-dashboard');

// Development tools
const {
  HotReloadManager,
  createHotReloadManager,
} = require('./dev/hot-reload');
const { DevServer, createDevServer } = require('./dev/dev-server');

module.exports = {
  // Core API
  createRagPipeline,
  createPipeline: createRagPipeline, // Alias for backward compatibility
  packContext,

  // Configuration
  loadConfig: loadRagConfig,
  loadRagConfig,
  validateRagrc,
  normalizeConfig,

  // Plugin system
  pluginRegistry,
  validatePlugin,

  // Utilities
  logger,
  errorFormatter,
  createError: errorFormatter.createError,
  wrapError: errorFormatter.wrapError,
  ERROR_CODES: errorFormatter.ERROR_CODES,
  BatchProcessor,
  RateLimiter,
  retry,
  withRetry,
  ConnectionPoolManager,

  // Security
  JWTValidator,
  PluginSignatureVerifier,
  validateInput,

  // Workflow engine
  DAGEngine: DAG,
  DAG,

  // Evaluation
  evaluateRagDataset,
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
  FileVectorStore,

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

  // Pipeline Debugger
  ExecutionTracer,
  TraceInspector,

  // MCP Integration
  MCPServer,
  MCPToolBuilder,

  // Quick Start Templates
  ProjectScaffolder,
  TemplateRegistry,

  // Streaming Adapters
  SSEAdapter,
  WebSocketAdapter,
  StreamRouter,

  // Connectors
  BaseConnector,
  OllamaConnector,
  LocalEmbedder,
  MemoryRetriever,
  PgVectorRetriever,
  QdrantRetriever,
  OpenAIConnector,
  AnthropicConnector,
  CohereConnector,

  // Streaming Embeddings
  StreamingEmbedder,
  createEmbeddingStream,

  // Advanced Reranking
  ScoringReranker,
  EmbeddingReranker,
  CascadeReranker,

  // GraphRAG
  KnowledgeGraph,
  EntityExtractor,
  GraphRetriever,
  GraphIndex,

  // Performance Dashboard
  DashboardGenerator,
  MetricsAggregator,

  // Performance & Observability
  ParallelProcessor,
  eventLogger,
  metrics,

  // Enterprise
  AuditLogger,

  // Ecosystem
  PluginHub,
  PluginAnalytics,
  PluginAnalyticsDashboard,

  // Development tools
  HotReloadManager,
  createHotReloadManager,
  DevServer,
  createDevServer,
};

// The ./testing build entry reads its module from here, so it shares the
// main bundle's classes (MemoryRetriever, createRagPipeline). A getter, so
// importing the package does not load the testing helpers.
Object.defineProperty(
  module.exports,
  Symbol.for('@devilsdev/rag-pipeline-utils/testing'),
  { get: () => require('./testing'), enumerable: false }, // eslint-disable-line global-require
);

// The ./experimental build entry reads its module from here (simulated or
// incomplete classes, removed from the main entry in 3.0.0). A getter, so
// importing the package does not load them.
Object.defineProperty(
  module.exports,
  Symbol.for('@devilsdev/rag-pipeline-utils/experimental'),
  { get: () => require('./experimental'), enumerable: false }, // eslint-disable-line global-require
);
