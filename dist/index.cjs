/**
 * RAG Pipeline Utils - Public API
 * Main entry point for consumers of the library
 */

// Core pipeline functionality
const { createRagPipeline } = require('../src/core/create-pipeline');

// Configuration utilities
const { loadConfig } = require('../src/config/load-config');
const { validateRagrc } = require('../src/config/enhanced-ragrc-schema');
const { normalizeConfig } = require('../src/config/normalize-config');

// Plugin system
const pluginRegistry = require('../src/core/plugin-registry');

// Utilities
const logger = require('../src/utils/logger');

// AI/ML capabilities
const MultiModalProcessor = require('../src/ai/multimodal');
const AdaptiveRetrievalEngine = require('../src/ai/retrieval-engine');

// DAG engine for complex workflows
const { DAGEngine } = require('../src/dag/dag-engine');

// Performance and observability
const ParallelProcessor = require('../src/core/performance/parallel-processor');
const eventLogger = require('../src/core/observability/event-logger');
const metrics = require('../src/core/observability/metrics');

// Enterprise features
const { AuditLogger } = require('../src/enterprise/audit-logging');
const { DataGovernance } = require('../src/enterprise/data-governance');

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
