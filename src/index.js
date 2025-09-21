/**
 * RAG Pipeline Utils - Public API
 * Main entry point for consumers of the library
 */

// Core pipeline functionality
const { createRagPipeline } = require('./core/create-pipeline');

// Configuration utilities
const { loadConfig } = require('./config/load-config');
const { validateRagrc } = require('./config/enhanced-ragrc-schema');
const { normalizeConfig } = require('./config/normalize-config');

// Plugin system
const pluginRegistry = require('./core/plugin-registry');

// Utilities
const logger = require('./utils/logger');

// AI/ML capabilities
const MultiModalProcessor = require('./ai/multimodal');
const AdaptiveRetrievalEngine = require('./ai/retrieval-engine');

// DAG engine for complex workflows
const { DAGEngine } = require('./dag/dag-engine');

// Performance and observability
const ParallelProcessor = require('./core/performance/parallel-processor');
const eventLogger = require('./core/observability/event-logger');
const metrics = require('./core/observability/metrics');

// Enterprise features
const { AuditLogger } = require('./enterprise/audit-logging');
const { DataGovernance } = require('./enterprise/data-governance');

module.exports = {
  // Core API
  createRagPipeline,
  createPipeline: createRagPipeline, // Alias for backward compatibility

  // Configuration
  loadConfig,
  validateRagrc,
  normalizeConfig,

  // Plugin system
  pluginRegistry,

  // Utilities
  logger,

  // AI/ML
  MultiModalProcessor,
  AdaptiveRetrievalEngine,

  // Workflow engine
  DAGEngine,

  // Performance & Observability
  ParallelProcessor,
  eventLogger,
  metrics,

  // Enterprise
  AuditLogger,
  DataGovernance,
};
