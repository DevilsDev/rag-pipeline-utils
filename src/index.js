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
