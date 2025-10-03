/**
 * RAG Pipeline Utils - ESM Build
 * Main entry point for ES module consumers
 *
 * NOTE: This file imports from CommonJS source files using default import + destructure
 * pattern for compatibility with Node.js ESM → CJS interop.
 */

// Core pipeline functionality
import createPipelinePkg from '../src/core/create-pipeline.js';
const { createRagPipeline } = createPipelinePkg;

// Configuration utilities
import loadConfigPkg from '../src/config/load-config.js';
const { loadConfig } = loadConfigPkg;

import validateRagrcPkg from '../src/config/enhanced-ragrc-schema.js';
const { validateRagrc } = validateRagrcPkg;

import normalizeConfigPkg from '../src/config/normalize-config.js';
const { normalizeConfig } = normalizeConfigPkg;

// Plugin system
import pluginRegistry from '../src/core/plugin-registry.js';

// Utilities
import logger from '../src/utils/logger.js';

// AI/ML capabilities
import MultiModalProcessor from '../src/ai/multimodal.js';
import AdaptiveRetrievalEngine from '../src/ai/retrieval-engine.js';

// DAG engine for complex workflows
import dagPkg from '../src/dag/dag-engine.js';
const { DAGEngine } = dagPkg;

// Performance and observability
import ParallelProcessor from '../src/core/performance/parallel-processor.js';
import eventLogger from '../src/core/observability/event-logger.js';
import metrics from '../src/core/observability/metrics.js';

// Enterprise features
import enterpriseAuditPkg from '../src/enterprise/audit-logging.js';
const { AuditLogger } = enterpriseAuditPkg;

import enterpriseDataPkg from '../src/enterprise/data-governance.js';
const { DataGovernance } = enterpriseDataPkg;

// Export all public API
export {
  createRagPipeline,
  loadConfig,
  validateRagrc,
  normalizeConfig,
  pluginRegistry,
  logger,
  MultiModalProcessor,
  AdaptiveRetrievalEngine,
  DAGEngine,
  ParallelProcessor,
  eventLogger,
  metrics,
  AuditLogger,
  DataGovernance
};

// Backward compatibility alias
export const createPipeline = createRagPipeline;
