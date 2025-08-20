/**
 * AI/ML Module Index - Refactored to use extracted bounded contexts
 * Provides unified interface to decomposed AI components
 */

const { ModelTrainingOrchestrator } = require('./training/model-training-orchestrator');
const { AdaptiveRetrievalEngine } = require('./retrieval/adaptive-retrieval-engine');
const { MultiModalProcessor } = require('./multimodal/multi-modal-processor');
const { FederatedLearningCoordinator } = require('./federation/federated-learning-coordinator');
const { logger } = require('../utils/logger');

/**
 * AI Module Factory - Creates and manages AI component instances
 */
class AIModuleFactory {
  constructor() {
    this.instances = new Map();
  }

  createTrainingOrchestrator(options = {}) {
    const instance = new ModelTrainingOrchestrator(options);
    this.instances.set('training', instance);
    logger.info('ModelTrainingOrchestrator created', { options });
    return instance;
  }

  createRetrievalEngine(options = {}) {
    const instance = new AdaptiveRetrievalEngine(options);
    this.instances.set('retrieval', instance);
    logger.info('AdaptiveRetrievalEngine created', { options });
    return instance;
  }

  createMultiModalProcessor(options = {}) {
    const instance = new MultiModalProcessor(options);
    this.instances.set('multimodal', instance);
    logger.info('MultiModalProcessor created', { options });
    return instance;
  }

  createFederationCoordinator(options = {}) {
    const instance = new FederatedLearningCoordinator(options);
    this.instances.set('federation', instance);
    logger.info('FederatedLearningCoordinator created', { options });
    return instance;
  }

  getInstance(type) {
    return this.instances.get(type);
  }

  getAllInstances() {
    return Object.fromEntries(this.instances);
  }
}

// Backward compatibility exports
module.exports = {
  ModelTrainingOrchestrator,
  AdaptiveRetrievalEngine,
  MultiModalProcessor,
  FederatedLearningCoordinator,
  AIModuleFactory
};
