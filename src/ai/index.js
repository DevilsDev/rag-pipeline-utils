/**
 * AI/ML Module Index - Refactored to use extracted bounded contexts
 * Provides unified interface to decomposed AI components
 */

const { ModelTrainingOrchestrator } = require("./model-training");
const { AdaptiveRetrieval } = require("./adaptive-retrieval");
const { MultiModalProcessor } = require("./multimodal-processing");
const { FederatedLearningCoordinator } = require("./federated-learning");
const { logger } = require("../utils/logger");

/**
 * AI Module Factory - Creates and manages AI component instances
 */
class AIModuleFactory {
  constructor() {
    this.instances = new Map();
  }

  createTrainingOrchestrator(options = {}) {
    const instance = new ModelTrainingOrchestrator(options);
    this.instances.set("training", instance);
    logger.info("ModelTrainingOrchestrator created", { options });
    return instance;
  }

  createRetrievalEngine(options = {}) {
    const instance = new AdaptiveRetrieval(options);
    this.instances.set("retrieval", instance);
    logger.info("AdaptiveRetrieval created", { options });
    return instance;
  }

  createMultiModalProcessor(options = {}) {
    const instance = new MultiModalProcessor(options);
    this.instances.set("multimodal", instance);
    logger.info("MultiModalProcessor created", { options });
    return instance;
  }

  createFederationCoordinator(options = {}) {
    const instance = new FederatedLearningCoordinator(options);
    this.instances.set("federation", instance);
    logger.info("FederatedLearningCoordinator created", { options });
    return instance;
  }

  getInstance(type) {
    return this.instances.get(type);
  }

  getAllInstances() {
    return Object.fromEntries(this.instances);
  }
}

// Ready-to-use singletons for test ergonomics.
const modelTrainer = new ModelTrainingOrchestrator();
const adaptiveRetrieval = new AdaptiveRetrieval();
const multiModalProcessor = new MultiModalProcessor();
const federatedLearning = new FederatedLearningCoordinator();

module.exports = {
  ModelTrainingOrchestrator,
  AdaptiveRetrieval,
  MultiModalProcessor,
  FederatedLearningCoordinator,
  AIModuleFactory,
  // Singletons (tests depend on these names/methods)
  modelTrainer,
  adaptiveRetrieval,
  multiModalProcessor,
  federatedLearning,
};
