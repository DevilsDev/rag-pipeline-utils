/**
 * Advanced AI/ML Capabilities Module
 * Exports all AI/ML components for the RAG Pipeline Utils
 */

// Model Training and Fine-tuning
const {
  ModelTrainingManager,
  ModelRegistry,
  TrainingDataProcessor,
  ModelEvaluator,
  EmbeddingTrainer,
  LLMTrainer
} = require('./model-training');

// Create aliases for the expected class names
const ModelTrainingOrchestrator = ModelTrainingManager;
const TrainingJobManager = ModelRegistry;
const ModelPerformanceEvaluator = ModelEvaluator;
const HyperparameterOptimizer = EmbeddingTrainer;
const ModelDeploymentManager = LLMTrainer;

// Adaptive Retrieval System
const {
  AdaptiveRetrievalManager,
  ReinforcementLearningAgent,
  ContextAnalyzer,
  FeedbackProcessor,
  RankingOptimizer,
  QueryProcessor
} = require('./adaptive-retrieval');

// Create aliases for the expected class names
const AdaptiveRetrievalEngine = AdaptiveRetrievalManager;
const UserProfileManager = ContextAnalyzer;
const PersonalizationEngine = RankingOptimizer;
const QueryUnderstandingEngine = QueryProcessor;

// Multi-modal Processing
const {
  MultiModalProcessor,
  ImageProcessor,
  AudioProcessor,
  VideoProcessor,
  TextProcessor,
  CrossModalEmbeddingAligner,
  MultiModalContentAnalyzer,
  MultiModalSearchEngine
} = require('./multimodal-processing');

// Federated Learning
const {
  FederatedLearningCoordinator,
  FederationSession,
  PrivacyPreservationEngine,
  ModelAggregator,
  FederatedPerformanceMonitor
} = require('./federated-learning');

/**
 * AI/ML Capabilities Factory
 * Creates and configures AI/ML components
 */
class AIMLFactory {
  constructor(config = {}) {
    this.config = {
      // Model Training Configuration
      training: {
        defaultBatchSize: 32,
        defaultLearningRate: 0.001,
        maxEpochs: 100,
        earlyStoppingPatience: 10,
        checkpointInterval: 1000,
        ...config.training
      },
      
      // Adaptive Retrieval Configuration
      adaptive: {
        explorationRate: 0.1,
        learningRate: 0.01,
        memorySize: 10000,
        updateFrequency: 100,
        ...config.adaptive
      },
      
      // Multi-modal Configuration
      multimodal: {
        unifiedDimension: 512,
        modalityWeights: {
          text: 0.4,
          image: 0.3,
          audio: 0.2,
          video: 0.1
        },
        processingBatchSize: 16,
        ...config.multimodal
      },
      
      // Federated Learning Configuration
      federated: {
        minParticipants: 3,
        maxParticipants: 100,
        convergenceThreshold: 0.001,
        maxRounds: 50,
        privacyBudget: 10.0,
        ...config.federated
      }
    };
  }

  /**
   * Create model training orchestrator
   */
  createModelTrainer(options = {}) {
    return new ModelTrainingOrchestrator({
      ...this.config.training,
      ...options
    });
  }

  /**
   * Create adaptive retrieval engine
   */
  createAdaptiveRetrieval(options = {}) {
    return new AdaptiveRetrievalEngine({
      ...this.config.adaptive,
      ...options
    });
  }

  /**
   * Create multi-modal processor
   */
  createMultiModalProcessor(options = {}) {
    return new MultiModalProcessor({
      ...this.config.multimodal,
      ...options
    });
  }

  /**
   * Create federated learning coordinator
   */
  createFederatedLearning(options = {}) {
    return new FederatedLearningCoordinator({
      ...this.config.federated,
      ...options
    });
  }

  /**
   * Create complete AI/ML suite
   */
  createAISuite(tenantId, options = {}) {
    const suite = {
      tenantId,
      modelTrainer: this.createModelTrainer(options.training),
      adaptiveRetrieval: this.createAdaptiveRetrieval(options.adaptive),
      multiModalProcessor: this.createMultiModalProcessor(options.multimodal),
      federatedLearning: this.createFederatedLearning(options.federated)
    };

    // Cross-component integration
    this._setupIntegrations(suite);

    return suite;
  }

  /**
   * Setup integrations between AI/ML components
   */
  _setupIntegrations(suite) {
    // Model training -> Adaptive retrieval integration
    suite.modelTrainer.on('model_deployed', async (deployment) => {
      if (deployment.modelType === 'embedding') {
        await suite.adaptiveRetrieval.updateEmbeddingModel(deployment.endpoint);
      }
    });

    // Multi-modal -> Federated learning integration
    suite.multiModalProcessor.on('content_processed', async (content) => {
      if (content.analysis?.quality > 0.8) {
        // High-quality content can be used for federated training
        suite.federatedLearning.emit('training_data_available', {
          tenantId: content.tenantId,
          contentId: content.id,
          modalities: Object.keys(content.modalities),
          quality: content.analysis.quality
        });
      }
    });

    // Adaptive retrieval -> Multi-modal integration
    suite.adaptiveRetrieval.on('user_preferences_updated', async (update) => {
      // Update multi-modal search weights based on user preferences
      const modalityWeights = this._calculateModalityWeights(update.preferences);
      suite.multiModalProcessor.updateModalityWeights(modalityWeights);
    });

    // Federated learning -> Model training integration
    suite.federatedLearning.on('federation_completed', async (federation) => {
      // Deploy federated model for general use
      const deploymentConfig = {
        modelId: federation.finalModel.id,
        environment: 'production',
        federatedOrigin: true
      };
      
      await suite.modelTrainer.deployFederatedModel(deploymentConfig);
    });
  }

  _calculateModalityWeights(preferences) {
    // Calculate modality weights based on user preferences
    const weights = { ...this.config.multimodal.modalityWeights };
    
    if (preferences.interests?.includes('visual')) {
      weights.image += 0.1;
      weights.video += 0.1;
    }
    
    if (preferences.interests?.includes('audio')) {
      weights.audio += 0.2;
    }
    
    // Normalize weights
    const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
    Object.keys(weights).forEach(key => {
      weights[key] /= total;
    });
    
    return weights;
  }
}

/**
 * AI/ML Utilities
 */
class AIMLUtils {
  /**
   * Validate AI/ML configuration
   */
  static validateConfig(config) {
    const errors = [];
    
    if (config.training?.learningRate && (config.training.learningRate <= 0 || config.training.learningRate > 1)) {
      errors.push('Learning rate must be between 0 and 1');
    }
    
    if (config.federated?.minParticipants && config.federated.minParticipants < 2) {
      errors.push('Minimum participants must be at least 2');
    }
    
    if (config.multimodal?.unifiedDimension && config.multimodal.unifiedDimension < 64) {
      errors.push('Unified dimension must be at least 64');
    }
    
    return errors;
  }

  /**
   * Calculate AI/ML resource requirements
   */
  static calculateResourceRequirements(config, workload) {
    const requirements = {
      cpu: 0,
      memory: 0,
      gpu: 0,
      storage: 0
    };
    
    // Model training requirements
    if (workload.training) {
      requirements.cpu += workload.training.jobs * 4;
      requirements.memory += workload.training.jobs * 8; // GB
      requirements.gpu += workload.training.jobs * 1;
      requirements.storage += workload.training.dataSize * 2; // GB
    }
    
    // Multi-modal processing requirements
    if (workload.multimodal) {
      requirements.cpu += workload.multimodal.contentCount * 0.1;
      requirements.memory += workload.multimodal.contentCount * 0.5; // GB
      requirements.storage += workload.multimodal.totalSize; // GB
    }
    
    // Federated learning requirements
    if (workload.federated) {
      requirements.cpu += workload.federated.participants * 2;
      requirements.memory += workload.federated.participants * 4; // GB
      requirements.storage += workload.federated.modelSize * workload.federated.participants; // GB
    }
    
    return requirements;
  }

  /**
   * Generate AI/ML performance report
   */
  static generatePerformanceReport(metrics) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalOperations: 0,
        averageLatency: 0,
        successRate: 0,
        resourceUtilization: 0
      },
      breakdown: {},
      recommendations: []
    };
    
    // Calculate summary metrics
    let totalOps = 0;
    let totalLatency = 0;
    let totalSuccess = 0;
    
    for (const [component, componentMetrics] of Object.entries(metrics)) {
      totalOps += componentMetrics.operations || 0;
      totalLatency += (componentMetrics.averageLatency || 0) * (componentMetrics.operations || 0);
      totalSuccess += (componentMetrics.successRate || 0) * (componentMetrics.operations || 0);
      
      report.breakdown[component] = {
        operations: componentMetrics.operations || 0,
        averageLatency: componentMetrics.averageLatency || 0,
        successRate: componentMetrics.successRate || 0,
        resourceUsage: componentMetrics.resourceUsage || {}
      };
    }
    
    report.summary.totalOperations = totalOps;
    report.summary.averageLatency = totalOps > 0 ? totalLatency / totalOps : 0;
    report.summary.successRate = totalOps > 0 ? totalSuccess / totalOps : 0;
    
    // Generate recommendations
    if (report.summary.averageLatency > 1000) {
      report.recommendations.push('Consider optimizing model inference or adding more compute resources');
    }
    
    if (report.summary.successRate < 0.95) {
      report.recommendations.push('Investigate failure patterns and improve error handling');
    }
    
    return report;
  }
}

// Export all components
module.exports = {
  // Core Classes
  ModelTrainingOrchestrator,
  AdaptiveRetrievalEngine,
  MultiModalProcessor,
  FederatedLearningCoordinator,
  
  // Factory and Utilities
  AIMLFactory,
  AIMLUtils,
  
  // Sub-components (for advanced usage)
  TrainingJobManager,
  HyperparameterOptimizer,
  ModelDeploymentManager,
  UserProfileManager,
  ReinforcementLearningAgent,
  ImageProcessor,
  AudioProcessor,
  VideoProcessor,
  CrossModalEmbeddingAligner,
  PrivacyPreservationEngine,
  ModelAggregator,
  
  // Constants
  AI_ML_CONSTANTS: {
    DEFAULT_EMBEDDING_DIMENSION: 768,
    DEFAULT_BATCH_SIZE: 32,
    DEFAULT_LEARNING_RATE: 0.001,
    MIN_FEDERATED_PARTICIPANTS: 3,
    MAX_FEDERATED_PARTICIPANTS: 100,
    CONVERGENCE_THRESHOLD: 0.001,
    PRIVACY_EPSILON_DEFAULT: 1.0
  }
};
