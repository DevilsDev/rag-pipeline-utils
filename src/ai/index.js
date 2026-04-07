/**
 * AI/ML Module Index - Decomposed Architecture
 * Provides unified interface to 4 separate AI modules
 *
 * Decomposed modules:
 * - orchestrator.js - ModelTrainingOrchestrator
 * - retrieval-engine.js - AdaptiveRetrievalEngine
 * - multimodal.js - MultiModalProcessor
 * - federation.js - FederatedLearningCoordinator
 */

const { ModelTrainingOrchestrator } = require("./orchestrator");
const { AdaptiveRetrievalEngine } = require("./retrieval-engine");
const { MultiModalProcessor } = require("./multimodal");
const { FederatedLearningCoordinator } = require("./federation");

module.exports = {
  ModelTrainingOrchestrator,
  AdaptiveRetrievalEngine,
  MultiModalProcessor,
  FederatedLearningCoordinator,
};
