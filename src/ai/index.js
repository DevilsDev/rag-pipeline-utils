/**
 * AI/ML Module Index - Decomposed Architecture
 * Provides unified interface to 4 separate AI modules as required by CLAUDE.md
 *
 * Decomposed modules:
 * - orchestrator.js - ModelTrainingOrchestrator
 * - retrieval-engine.js - AdaptiveRetrievalEngine
 * - multimodal.js - MultiModalProcessor
 * - federation.js - FederatedLearningCoordinator
 */

const orchestrator = require("./orchestrator");
const retrievalEngine = require("./retrieval-engine");
const multimodal = require("./multimodal");
const federation = require("./federation");

// Export the decomposed modules
module.exports = {
  // Primary exports with new decomposed architecture
  ModelTrainingOrchestrator: orchestrator,
  AdaptiveRetrievalEngine: retrievalEngine,
  MultiModalProcessor: multimodal,
  FederatedLearningCoordinator: federation,

  // Legacy names for backward compatibility
  modelTrainer: orchestrator,
  adaptiveRetrieval: retrievalEngine,
  multiModalProcessor: multimodal,
  federatedLearning: federation,
};

// CJS+ESM interop pattern
module.exports.default = module.exports;
