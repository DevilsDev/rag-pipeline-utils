/**
 * RAG Pipeline Utils - ESM Build
 * Main entry point for ES module consumers
 */

/**
 * RAG Pipeline Utils - Public API
 * Main entry point for consumers of the library
 */

// Core pipeline functionality
import createpipelineModule from '../src/core/create-pipeline.js';
const { createRagPipeline  } = createpipelineModule;

// Configuration utilities
import loadconfigModule from '../src/config/load-config.js';
const { loadConfig  } = loadconfigModule;
import enhancedragrcschemaModule from '../src/config/enhanced-ragrc-schema.js';
const { validateRagrc  } = enhancedragrcschemaModule;
import normalizeconfigModule from '../src/config/normalize-config.js';
const { normalizeConfig  } = normalizeconfigModule;

// Plugin system
import pluginRegistry from '../src/core/plugin-registry.js';

// Utilities
import logger from '../src/utils/logger.js';
import errorFormatter from '../src/utils/error-formatter.js';

// AI/ML capabilities
import MultiModalProcessor from '../src/ai/multimodal.js';
import AdaptiveRetrievalEngine from '../src/ai/retrieval-engine.js';

// DAG engine for complex workflows
import dagengineModule from '../src/dag/dag-engine.js';
const { DAGEngine  } = dagengineModule;

// Performance and observability
import ParallelProcessor from '../src/core/performance/parallel-processor.js';
import eventLogger from '../src/core/observability/event-logger.js';
import metrics from '../src/core/observability/metrics.js';

// Enterprise features
import auditloggingModule from '../src/enterprise/audit-logging.js';
const { AuditLogger  } = auditloggingModule;
import datagovernanceModule from '../src/enterprise/data-governance.js';
const { DataGovernance  } = datagovernanceModule;

// Development tools
import hotreloadModule from '../src/dev/hot-reload.js';
const { HotReloadManager,
  createHotReloadManager,
 } = hotreloadModule;
import devserverModule from '../src/dev/dev-server.js';
const { DevServer, createDevServer  } = devserverModule;

export {
  createRagPipeline,
  loadConfig,
  validateRagrc,
  normalizeConfig,
  pluginRegistry,
  logger,
  errorFormatter,
  MultiModalProcessor,
  AdaptiveRetrievalEngine,
  DAGEngine,
  ParallelProcessor,
  eventLogger,
  metrics,
  AuditLogger,
  DataGovernance,
  HotReloadManager,
  createHotReloadManager,
  DevServer,
  createDevServer
};

// Backward compatibility aliases
export const createPipeline = createRagPipeline;
