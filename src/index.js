/**
 * RAG Pipeline Utils - Public API
 * Main entry point for consumers of the library
 */

// Core pipeline functionality
const { createRagPipeline } = require("./core/create-pipeline");

// Configuration utilities
const { loadRagConfig } = require("./config/load-config");
const { validateRagrc } = require("./config/enhanced-ragrc-schema");
const { normalizeConfig } = require("./config/normalize-config");

// Plugin system
const pluginRegistry = require("./core/plugin-registry");

// Utilities
const logger = require("./utils/logger");
const errorFormatter = require("./utils/error-formatter");
const { BatchProcessor } = require("./utils/batch-processor");
const RateLimiter = require("./utils/rate-limiter");
const { retry, withRetry } = require("./utils/retry");
const { ConnectionPoolManager } = require("./utils/connection-pool");

// Security
const { JWTValidator } = require("./security/jwt-validator");
const { PluginSandbox } = require("./security/plugin-sandbox");
const {
  PluginSignatureVerifier,
} = require("./security/plugin-signature-verifier");
const { validateInput } = require("./security/validator");

// AI/ML capabilities
const { MultiModalProcessor } = require("./ai/multimodal");
const { AdaptiveRetrievalEngine } = require("./ai/retrieval-engine");
const {
  FederatedLearningCoordinator,
} = require("./ai/federation/federated-learning-coordinator");
const {
  ModelTrainingOrchestrator,
} = require("./ai/training/model-training-orchestrator");

// DAG engine for complex workflows
const { DAG } = require("./dag/dag-engine");

// Evaluation
const { evaluateRagDataset } = require("./evaluate/evaluator");
const {
  scoreAnswer,
  computeBLEU,
  computeROUGE,
} = require("./evaluate/scoring");
const { computeFaithfulness } = require("./evaluate/faithfulness");
const { computeAnswerRelevance } = require("./evaluate/relevance");
const {
  computeContextPrecision,
  computeContextRecall,
} = require("./evaluate/context-metrics");
const { computeGroundedness } = require("./evaluate/groundedness");
const { PipelineEvaluator } = require("./evaluate/pipeline-evaluator");

// Chunking
const { ChunkingEngine } = require("./chunking/chunking-engine");

// Citation & Grounding
const { CitationTracker } = require("./citation/citation-tracker");
const {
  mapSentenceToSources,
  buildIDFWeights,
} = require("./citation/source-mapper");
const { detectHallucinations } = require("./citation/hallucination-detector");

// Hybrid Retrieval
const { BM25Search } = require("./retrieval/bm25-search");
const { reciprocalRankFusion } = require("./retrieval/rank-fusion");
const { HybridRetriever } = require("./retrieval/hybrid-retriever");

// Guardrails
const { PreRetrievalGuard } = require("./guardrails/pre-retrieval-guard");
const { RetrievalGuard } = require("./guardrails/retrieval-guard");
const { PostGenerationGuard } = require("./guardrails/post-generation-guard");
const { GuardrailsPipeline } = require("./guardrails/guardrails-pipeline");

// Agentic RAG
const { QueryPlanner } = require("./agentic/query-planner");
const { IterativeRetriever } = require("./agentic/iterative-retriever");
const { SelfCritiqueChecker } = require("./agentic/self-critique");
const { AgenticPipeline } = require("./agentic/agentic-pipeline");

// Cost Management
const { CostCalculator } = require("./cost/cost-calculator");
const { CostTracker } = require("./cost/cost-tracker");
const { TokenBudget } = require("./cost/token-budget");

// Pipeline Debugger
const { ExecutionTracer } = require("./debug/execution-tracer");
const { TraceInspector } = require("./debug/trace-inspector");

// MCP Integration
const { MCPServer } = require("./mcp/mcp-server");
const { MCPToolBuilder } = require("./mcp/mcp-tool-builder");

// Quick Start Templates
const { ProjectScaffolder } = require("./templates/scaffold");
const { TemplateRegistry } = require("./templates/template-registry");

// Performance and observability
const ParallelProcessor = require("./core/performance/parallel-processor");
const eventLogger = require("./core/observability/event-logger");
const metrics = require("./core/observability/metrics");

// Enterprise features
const { AuditLogger } = require("./enterprise/audit-logging");
const { DataGovernanceManager } = require("./enterprise/data-governance");
const {
  TenantManager,
  ResourceMonitor,
} = require("./enterprise/multi-tenancy");
const {
  SSOManager,
  SAMLProvider,
  OAuth2Provider,
  ActiveDirectoryProvider,
  OIDCProvider,
} = require("./enterprise/sso-integration");

// Ecosystem
const { PluginHub, PluginAnalytics } = require("./ecosystem/plugin-hub");
const { PluginCertification } = require("./ecosystem/plugin-certification");
const {
  PluginAnalyticsDashboard,
} = require("./ecosystem/plugin-analytics-dashboard");

// Development tools
const {
  HotReloadManager,
  createHotReloadManager,
} = require("./dev/hot-reload");
const { DevServer, createDevServer } = require("./dev/dev-server");

module.exports = {
  // Core API
  createRagPipeline,
  createPipeline: createRagPipeline, // Alias for backward compatibility

  // Configuration
  loadConfig: loadRagConfig,
  loadRagConfig,
  validateRagrc,
  normalizeConfig,

  // Plugin system
  pluginRegistry,

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
  PluginSandbox,
  PluginSignatureVerifier,
  validateInput,

  // AI/ML
  MultiModalProcessor,
  AdaptiveRetrievalEngine,
  FederatedLearningCoordinator,
  ModelTrainingOrchestrator,

  // Workflow engine
  DAGEngine: DAG,
  DAG,

  // Evaluation
  evaluateRagDataset,
  scoreAnswer,
  computeBLEU,
  computeROUGE,
  computeFaithfulness,
  computeAnswerRelevance,
  computeContextPrecision,
  computeContextRecall,
  computeGroundedness,
  PipelineEvaluator,

  // Chunking
  ChunkingEngine,

  // Citation & Grounding
  CitationTracker,
  mapSentenceToSources,
  buildIDFWeights,
  detectHallucinations,

  // Hybrid Retrieval
  BM25Search,
  reciprocalRankFusion,
  HybridRetriever,

  // Guardrails
  PreRetrievalGuard,
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
  CostTracker,
  TokenBudget,

  // Pipeline Debugger
  ExecutionTracer,
  TraceInspector,

  // MCP Integration
  MCPServer,
  MCPToolBuilder,

  // Quick Start Templates
  ProjectScaffolder,
  TemplateRegistry,

  // Performance & Observability
  ParallelProcessor,
  eventLogger,
  metrics,

  // Enterprise
  AuditLogger,
  DataGovernance: DataGovernanceManager,
  DataGovernanceManager,
  TenantManager,
  ResourceMonitor,
  SSOManager,
  SAMLProvider,
  OAuth2Provider,
  ActiveDirectoryProvider,
  OIDCProvider,

  // Ecosystem
  PluginHub,
  PluginAnalytics,
  PluginCertification,
  PluginAnalyticsDashboard,

  // Development tools
  HotReloadManager,
  createHotReloadManager,
  DevServer,
  createDevServer,
};
