/**
 * AI/ML Module Index - Refactored to use extracted bounded contexts
 * Provides unified interface to decomposed AI components
 */

const modelTraining = require("./model-training");
const adaptiveRetrieval = require("./adaptive-retrieval");
const multiModalProcessor = require("./multimodal-processing");
const federatedLearning = require("./federated-learning");

// Export the singleton objects directly
module.exports = {
  // Direct singleton exports (what tests expect)
  ModelTrainingOrchestrator: modelTraining,
  AdaptiveRetrieval: adaptiveRetrieval,
  MultiModalProcessor: multiModalProcessor,
  FederatedLearningCoordinator: federatedLearning,

  // Legacy names for backward compatibility
  modelTrainer: modelTraining,
  adaptiveRetrieval: adaptiveRetrieval,
  multiModalProcessor: multiModalProcessor,
  federatedLearning: federatedLearning,
};

// CJS+ESM interop pattern
module.exports.default = module.exports;
