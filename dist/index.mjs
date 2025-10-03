/**
 * RAG Pipeline Utils - ESM Build
 * Main entry point for ES module consumers
 */

/**
 * RAG Pipeline Utils - Public API
 * Main entry point for consumers of the library
 */

// Core pipeline functionality
import { createRagPipeline  } from '../src/core/create-pipeline.js';

// Configuration utilities
import { loadConfig  } from '../src/config/load-config.js';
import { validateRagrc  } from '../src/config/enhanced-ragrc-schema.js';
import { normalizeConfig  } from '../src/config/normalize-config.js';

// Plugin system
import pluginRegistry from '../src/core/plugin-registry.js';

// Utilities
import logger from '../src/utils/logger.js';

// AI/ML capabilities
import MultiModalProcessor from '../src/ai/multimodal.js';
import AdaptiveRetrievalEngine from '../src/ai/retrieval-engine.js';

// DAG engine for complex workflows
import { DAGEngine  } from '../src/dag/dag-engine.js';

// Performance and observability
import ParallelProcessor from '../src/core/performance/parallel-processor.js';
import eventLogger from '../src/core/observability/event-logger.js';
import metrics from '../src/core/observability/metrics.js';

// Enterprise features
import { AuditLogger  } from '../src/enterprise/audit-logging.js';
import { DataGovernance  } from '../src/enterprise/data-governance.js';

export {
  validateRagrc,
  normalizeConfig,
  AdaptiveRetrievalEngine,
  eventLogger,
  metrics,
  DataGovernance
};

// Backward compatibility aliases
export const createPipeline = createRagPipeline;
