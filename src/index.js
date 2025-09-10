/**
 * RAG Pipeline Utils - Public API
 * Main entry point for consumers of the library
 */

// Core pipeline functionality
const { createPipeline } = require('./core/create-pipeline');

// Configuration utilities
const { loadConfig } = require('./config/load-config');
const { validateRagrc } = require('./config/enhanced-ragrc-schema');
const { normalizeConfig } = require('./config/normalize-config');

// Plugin system
const pluginRegistry = require('./core/plugin-registry');

// Utilities
const logger = require('./utils/logger');

// AI/ML capabilities
const { MultiModalProcessor } = require('./ai/multimodal-processing');
const { AdaptiveRetrievalEngine } = require('./ai/adaptive-retrieval');

// DAG engine for complex workflows
const { DAGEngine } = require('./dag/dag-engine');

// Performance and observability
const { PerformanceMonitor } = require('./core/performance/monitor');
const { ObservabilityCollector } = require('./observability/collector');

// Enterprise features
const { AuditLogger } = require('./enterprise/audit-logging');
const { DataGovernance } = require('./enterprise/data-governance');

module.exports = {
  // Core API
  createPipeline,

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

  // Observability
  PerformanceMonitor,
  ObservabilityCollector,

  // Enterprise
  AuditLogger,
  DataGovernance,
};
