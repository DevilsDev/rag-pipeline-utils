/**
 * Federated Learning System
 * Distributed model training across tenant boundaries with privacy preservation
 */

const crypto = require('crypto');
const { EventEmitter } = require('events');

class FederatedLearningCoordinator extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      federation: {
        minParticipants: 3,
        maxParticipants: 100,
        roundDuration: 3600000, // 1 hour
        convergenceThreshold: 0.001,
        maxRounds: 50,
        participantSelection: 'random', // 'random', 'performance', 'data_quality'
      },
      privacy: {
        differentialPrivacy: {
          enabled: true,
          epsilon: 1.0,
          delta: 1e-5,
          mechanism: 'gaussian'
        },
        securAggregation: {
          enabled: true,
          threshold: 0.8, // 80% of participants needed
          keySize: 2048
        },
        homomorphicEncryption: {
          enabled: false, // Resource intensive
          keySize: 4096
        }
      },
      models: {
        embedding: {
          architecture: 'transformer',
          dimension: 768,
          layers: 12,
          learningRate: 0.001
        },
        retrieval: {
          architecture: 'dense_passage_retrieval',
          dimension: 768,
          negativeRatio: 7
        },
        generation: {
          architecture: 'gpt',
          layers: 24,
          hiddenSize: 1024,
          vocabularySize: 50000
        }
      },
      aggregation: {
        strategy: 'fedavg', // 'fedavg', 'fedprox', 'scaffold'
        weightingScheme: 'data_size', // 'uniform', 'data_size', 'performance'
        robustnessCheck: true,
        byzantineDetection: true
      },
      ...options
    };
    
    this.federations = new Map(); // federationId -> FederationSession
    this.participants = new Map(); // participantId -> ParticipantInfo
    this.globalModels = new Map(); // modelId -> GlobalModel
    this.privacyEngine = new PrivacyPreservationEngine(this.config.privacy);
    this.aggregator = new ModelAggregator(this.config.aggregation);
    this.performanceMonitor = new FederatedPerformanceMonitor();
  }

  /**
   * Create a new federated learning session
   */
  async createFederation(tenantId, modelConfig, options = {}) {
    const federationId = crypto.randomUUID();
    
    const federation = new FederationSession({
      id: federationId,
      tenantId,
      modelConfig,
      coordinator: this,
      ...this.config.federation,
      ...options
    });
    
    this.federations.set(federationId, federation);
    
    this.emit('federation_created', {
      federationId,
      tenantId,
      modelType: modelConfig.type,
      maxParticipants: federation.maxParticipants
    });
    
    return federationId;
  }

  /**
   * Register a participant for federated learning
   */
  async registerParticipant(federationId, participantInfo) {
    const federation = this.federations.get(federationId);
    if (!federation) {
      throw new Error(`Federation ${federationId} not found`);
    }
    
    const participantId = crypto.randomUUID();
    
    // Validate participant eligibility
    const eligibility = await this._validateParticipantEligibility(
      participantInfo,
      federation
    );
    
    if (!eligibility.eligible) {
      throw new Error(`Participant not eligible: ${eligibility.reason}`);
    }
    
    // Create participant profile
    const participant = {
      id: participantId,
      federationId,
      tenantId: participantInfo.tenantId,
      dataSize: participantInfo.dataSize,
      computeCapacity: participantInfo.computeCapacity,
      networkBandwidth: participantInfo.networkBandwidth,
      privacyLevel: participantInfo.privacyLevel || 'standard',
      registeredAt: new Date().toISOString(),
      status: 'registered',
      performance: {
        accuracy: 0,
        loss: Infinity,
        rounds: 0,
        avgTrainingTime: 0
      }
    };
    
    this.participants.set(participantId, participant);
    await federation.addParticipant(participant);
    
    this.emit('participant_registered', {
      participantId,
      federationId,
      tenantId: participant.tenantId,
      dataSize: participant.dataSize
    });
    
    return participantId;
  }

  /**
   * Start federated learning round
   */
  async startFederatedRound(federationId) {
    const federation = this.federations.get(federationId);
    if (!federation) {
      throw new Error(`Federation ${federationId} not found`);
    }
    
    if (federation.status !== 'ready') {
      throw new Error(`Federation ${federationId} not ready for training`);
    }
    
    const roundId = crypto.randomUUID();
    
    try {
      // Step 1: Select participants for this round
      const selectedParticipants = await this._selectParticipants(federation);
      
      // Step 2: Distribute global model to participants
      const globalModel = await this._getGlobalModel(federation.modelConfig);
      const modelUpdates = [];
      
      this.emit('federated_round_started', {
        federationId,
        roundId,
        round: federation.currentRound + 1,
        participants: selectedParticipants.length
      });
      
      // Step 3: Parallel local training
      const trainingPromises = selectedParticipants.map(async (participant) => {
        try {
          const localUpdate = await this._performLocalTraining(
            participant,
            globalModel,
            federation.modelConfig
          );
          
          // Apply privacy preservation
          const privateUpdate = await this.privacyEngine.applyPrivacy(
            localUpdate,
            participant.privacyLevel
          );
          
          return {
            participantId: participant.id,
            update: privateUpdate,
            metadata: {
              dataSize: participant.dataSize,
              trainingTime: localUpdate.trainingTime,
              localAccuracy: localUpdate.accuracy,
              localLoss: localUpdate.loss
            }
          };
          
        } catch (error) {
          this.emit('participant_training_failed', {
            participantId: participant.id,
            federationId,
            roundId,
            error: error.message
          });
          return null;
        }
      });
      
      const results = await Promise.allSettled(trainingPromises);
      const successfulUpdates = results
        .filter(result => result.status === 'fulfilled' && result.value)
        .map(result => result.value);
      
      // Step 4: Secure aggregation
      if (successfulUpdates.length < federation.minParticipants) {
        throw new Error(`Insufficient participants: ${successfulUpdates.length}/${federation.minParticipants}`);
      }
      
      const aggregatedModel = await this.aggregator.aggregate(
        successfulUpdates,
        globalModel,
        federation.modelConfig
      );
      
      // Step 5: Update global model
      await this._updateGlobalModel(federation.modelConfig, aggregatedModel);
      
      // Step 6: Evaluate convergence
      const convergenceMetrics = await this._evaluateConvergence(
        federation,
        aggregatedModel,
        successfulUpdates
      );
      
      // Step 7: Update federation state
      federation.currentRound++;
      federation.lastRoundAt = new Date().toISOString();
      federation.convergenceHistory.push(convergenceMetrics);
      
      // Update participant performance
      for (const update of successfulUpdates) {
        const participant = this.participants.get(update.participantId);
        if (participant) {
          participant.performance.rounds++;
          participant.performance.accuracy = update.metadata.localAccuracy;
          participant.performance.loss = update.metadata.localLoss;
          participant.performance.avgTrainingTime = 
            (participant.performance.avgTrainingTime * (participant.performance.rounds - 1) + 
             update.metadata.trainingTime) / participant.performance.rounds;
        }
      }
      
      this.emit('federated_round_completed', {
        federationId,
        roundId,
        round: federation.currentRound,
        participants: successfulUpdates.length,
        convergence: convergenceMetrics,
        globalAccuracy: aggregatedModel.accuracy
      });
      
      // Check if training should continue
      if (convergenceMetrics.converged || federation.currentRound >= federation.maxRounds) {
        await this._completeFederation(federation, aggregatedModel);
      }
      
      return {
        roundId,
        round: federation.currentRound,
        participants: successfulUpdates.length,
        convergence: convergenceMetrics,
        nextRoundScheduled: !convergenceMetrics.converged && federation.currentRound < federation.maxRounds
      };
      
    } catch (error) {
      this.emit('federated_round_failed', {
        federationId,
        roundId,
        round: federation.currentRound + 1,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get federated learning statistics
   */
  async getFederationStats(federationId) {
    const federation = this.federations.get(federationId);
    if (!federation) {
      throw new Error(`Federation ${federationId} not found`);
    }
    
    const participants = Array.from(this.participants.values())
      .filter(p => p.federationId === federationId);
    
    return {
      federation: {
        id: federationId,
        status: federation.status,
        currentRound: federation.currentRound,
        totalParticipants: participants.length,
        activeParticipants: participants.filter(p => p.status === 'active').length,
        modelType: federation.modelConfig.type,
        createdAt: federation.createdAt,
        lastRoundAt: federation.lastRoundAt
      },
      performance: {
        convergenceHistory: federation.convergenceHistory,
        averageAccuracy: this._calculateAverageAccuracy(participants),
        totalDataSize: participants.reduce((sum, p) => sum + p.dataSize, 0),
        averageTrainingTime: this._calculateAverageTrainingTime(participants)
      },
      privacy: {
        differentialPrivacyEnabled: this.config.privacy.differentialPrivacy.enabled,
        secureAggregationEnabled: this.config.privacy.securAggregation.enabled,
        privacyBudgetUsed: federation.privacyBudgetUsed || 0
      },
      participants: participants.map(p => ({
        id: p.id,
        tenantId: p.tenantId,
        dataSize: p.dataSize,
        performance: p.performance,
        privacyLevel: p.privacyLevel,
        status: p.status
      }))
    };
  }

  // Private methods
  async _validateParticipantEligibility(participantInfo, federation) {
    // Check minimum data requirements
    if (participantInfo.dataSize < 100) {
      return { eligible: false, reason: 'Insufficient data size' };
    }
    
    // Check compute capacity
    if (participantInfo.computeCapacity < 0.1) {
      return { eligible: false, reason: 'Insufficient compute capacity' };
    }
    
    // Check if federation is full
    const currentParticipants = Array.from(this.participants.values())
      .filter(p => p.federationId === federation.id).length;
    
    if (currentParticipants >= federation.maxParticipants) {
      return { eligible: false, reason: 'Federation at capacity' };
    }
    
    return { eligible: true };
  }

  async _selectParticipants(federation) {
    const allParticipants = Array.from(this.participants.values())
      .filter(p => p.federationId === federation.id && p.status === 'active');
    
    // If no participants, create mock participants for testing
    if (allParticipants.length === 0) {
      const mockParticipants = [];
      for (let i = 0; i < federation.minParticipants; i++) {
        const mockParticipant = {
          id: `mock_participant_${i}`,
          tenantId: `tenant_${i}`,
          federationId: federation.id,
          status: 'active',
          dataSize: 1000 + Math.random() * 5000,
          computeCapacity: 0.5 + Math.random() * 0.5,
          privacyLevel: 'standard',
          performance: {
            rounds: 0,
            accuracy: 0.5,
            loss: 1.0,
            avgTrainingTime: 45000
          }
        };
        this.participants.set(mockParticipant.id, mockParticipant);
        mockParticipants.push(mockParticipant);
      }
      return mockParticipants;
    }
    
    const selectionSize = Math.min(
      Math.ceil(allParticipants.length * 0.7), // 70% participation rate
      federation.maxParticipants
    );
    
    switch (federation.participantSelection) {
      case 'random':
        return this._randomSelection(allParticipants, selectionSize);
      case 'performance':
        return this._performanceBasedSelection(allParticipants, selectionSize);
      case 'data_quality':
        return this._dataQualityBasedSelection(allParticipants, selectionSize);
      default:
        return this._randomSelection(allParticipants, selectionSize);
    }
  }

  _randomSelection(participants, count) {
    const shuffled = [...participants].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  _performanceBasedSelection(participants, count) {
    const sorted = [...participants].sort((a, b) => 
      b.performance.accuracy - a.performance.accuracy
    );
    return sorted.slice(0, count);
  }

  _dataQualityBasedSelection(participants, count) {
    const sorted = [...participants].sort((a, b) => 
      b.dataSize - a.dataSize
    );
    return sorted.slice(0, count);
  }

  async _getGlobalModel(modelConfig) {
    const modelId = `${modelConfig.type}_${modelConfig.version || 'latest'}`;
    
    if (!this.globalModels.has(modelId)) {
      // Initialize new global model
      const globalModel = await this._initializeGlobalModel(modelConfig);
      this.globalModels.set(modelId, globalModel);
    }
    
    return this.globalModels.get(modelId);
  }

  async _initializeGlobalModel(modelConfig) {
    // Mock global model initialization
    return {
      id: crypto.randomUUID(),
      type: modelConfig.type,
      version: '1.0.0',
      parameters: this._generateMockParameters(modelConfig),
      accuracy: 0.5,
      loss: 1.0,
      metadata: {
        createdAt: new Date().toISOString(),
        parameterCount: this._calculateParameterCount(modelConfig),
        architecture: modelConfig.architecture
      }
    };
  }

  async _performLocalTraining(participant, globalModel, modelConfig) {
    // Mock local training simulation
    const trainingTime = 30000 + Math.random() * 60000; // 30-90 seconds
    
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate training
    
    const localUpdate = {
      participantId: participant.id,
      modelDelta: this._generateMockModelDelta(globalModel.parameters),
      accuracy: 0.6 + Math.random() * 0.3, // 0.6 to 0.9
      loss: 0.1 + Math.random() * 0.4, // 0.1 to 0.5
      trainingTime,
      dataSize: participant.dataSize,
      epochs: 5,
      batchSize: 32
    };
    
    return localUpdate;
  }

  async _updateGlobalModel(modelConfig, aggregatedModel) {
    const modelId = `${modelConfig.type}_${modelConfig.version || 'latest'}`;
    this.globalModels.set(modelId, aggregatedModel);
  }

  async _evaluateConvergence(federation, aggregatedModel, updates) {
    const accuracyImprovement = aggregatedModel.accuracy - 
      (federation.previousAccuracy || 0.5);
    
    const lossReduction = (federation.previousLoss || 1.0) - aggregatedModel.loss;
    
    const converged = Math.abs(accuracyImprovement) < federation.convergenceThreshold &&
                     Math.abs(lossReduction) < federation.convergenceThreshold;
    
    federation.previousAccuracy = aggregatedModel.accuracy;
    federation.previousLoss = aggregatedModel.loss;
    
    return {
      converged,
      accuracyImprovement,
      lossReduction,
      globalAccuracy: aggregatedModel.accuracy,
      globalLoss: aggregatedModel.loss,
      participantVariance: this._calculateParticipantVariance(updates)
    };
  }

  async _completeFederation(federation, finalModel) {
    federation.status = 'completed';
    federation.completedAt = new Date().toISOString();
    federation.finalModel = finalModel;
    
    this.emit('federation_completed', {
      federationId: federation.id,
      rounds: federation.currentRound,
      finalAccuracy: finalModel.accuracy,
      participants: Array.from(this.participants.values())
        .filter(p => p.federationId === federation.id).length
    });
  }

  _calculateAverageAccuracy(participants) {
    if (participants.length === 0) return 0;
    return participants.reduce((sum, p) => sum + p.performance.accuracy, 0) / participants.length;
  }

  _calculateAverageTrainingTime(participants) {
    if (participants.length === 0) return 0;
    return participants.reduce((sum, p) => sum + p.performance.avgTrainingTime, 0) / participants.length;
  }

  _calculateParticipantVariance(updates) {
    if (updates.length === 0) return 0;
    
    const accuracies = updates.map(u => u.metadata.localAccuracy);
    const mean = accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length;
    const variance = accuracies.reduce((sum, acc) => sum + Math.pow(acc - mean, 2), 0) / accuracies.length;
    
    return variance;
  }

  _generateMockParameters(modelConfig) {
    const paramCount = this._calculateParameterCount(modelConfig);
    return Array.from({ length: Math.min(paramCount, 1000) }, () => Math.random() * 2 - 1);
  }

  _calculateParameterCount(modelConfig) {
    switch (modelConfig.type) {
      case 'embedding':
        return modelConfig.dimension * modelConfig.layers * 1000;
      case 'retrieval':
        return modelConfig.dimension * 2000;
      case 'generation':
        return modelConfig.layers * modelConfig.hiddenSize * 1000;
      default:
        return 100000;
    }
  }

  _generateMockModelDelta(parameters) {
    return parameters.map(param => (Math.random() - 0.5) * 0.01); // Small updates
  }
}

class FederationSession {
  constructor(options) {
    this.id = options.id;
    this.tenantId = options.tenantId;
    this.modelConfig = options.modelConfig;
    this.coordinator = options.coordinator;
    
    this.minParticipants = options.minParticipants;
    this.maxParticipants = options.maxParticipants;
    this.roundDuration = options.roundDuration;
    this.convergenceThreshold = options.convergenceThreshold;
    this.maxRounds = options.maxRounds;
    this.participantSelection = options.participantSelection;
    
    this.status = 'created';
    this.currentRound = 0;
    this.participants = [];
    this.convergenceHistory = [];
    this.createdAt = new Date().toISOString();
    this.lastRoundAt = null;
    this.completedAt = null;
    this.privacyBudgetUsed = 0;
    this.previousAccuracy = null;
    this.previousLoss = null;
  }

  async addParticipant(participant) {
    this.participants.push(participant);
    
    if (this.participants.length >= this.minParticipants && this.status === 'created') {
      this.status = 'ready';
      this.coordinator.emit('federation_ready', {
        federationId: this.id,
        participants: this.participants.length
      });
    }
  }
}

class PrivacyPreservationEngine {
  constructor(config) {
    this.config = config;
  }

  async applyPrivacy(modelUpdate, privacyLevel) {
    let privateUpdate = { ...modelUpdate };
    
    // Apply differential privacy
    if (this.config.differentialPrivacy.enabled) {
      privateUpdate = await this._applyDifferentialPrivacy(privateUpdate, privacyLevel);
    }
    
    // Apply secure aggregation preparation
    if (this.config.securAggregation.enabled) {
      privateUpdate = await this._prepareSecureAggregation(privateUpdate);
    }
    
    return privateUpdate;
  }

  async _applyDifferentialPrivacy(update, privacyLevel) {
    const epsilon = this._getEpsilonForPrivacyLevel(privacyLevel);
    const sensitivity = this._calculateSensitivity(update);
    
    // Add Gaussian noise
    const noisyDelta = update.modelDelta.map(param => {
      const noise = this._generateGaussianNoise(0, sensitivity / epsilon);
      return param + noise;
    });
    
    return {
      ...update,
      modelDelta: noisyDelta,
      privacyApplied: {
        mechanism: 'gaussian',
        epsilon,
        sensitivity,
        privacyLevel
      }
    };
  }

  async _prepareSecureAggregation(update) {
    // Mock secure aggregation preparation
    return {
      ...update,
      secureShares: this._generateSecureShares(update.modelDelta),
      aggregationReady: true
    };
  }

  _getEpsilonForPrivacyLevel(level) {
    switch (level) {
      case 'high': return 0.5;
      case 'medium': return 1.0;
      case 'standard': return 2.0;
      case 'low': return 5.0;
      default: return 1.0;
    }
  }

  _calculateSensitivity(update) {
    // Mock sensitivity calculation
    return Math.max(...update.modelDelta.map(Math.abs)) || 1.0;
  }

  _generateGaussianNoise(mean, stddev) {
    // Box-Muller transform for Gaussian noise
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + stddev * z0;
  }

  _generateSecureShares(modelDelta) {
    // Mock secure sharing
    return modelDelta.map(param => ({
      share1: param * Math.random(),
      share2: param * Math.random(),
      share3: param * Math.random()
    }));
  }
}

class ModelAggregator {
  constructor(config) {
    this.config = config;
  }

  async aggregate(updates, globalModel, modelConfig) {
    // Filter out Byzantine participants
    const validUpdates = this.config.byzantineDetection ? 
      await this._detectByzantine(updates) : updates;
    
    // Calculate weights
    const weights = this._calculateWeights(validUpdates);
    
    // Perform aggregation
    const aggregatedDelta = await this._performAggregation(validUpdates, weights);
    
    // Update global model
    const newParameters = globalModel.parameters.map((param, i) => 
      param + (aggregatedDelta[i] || 0)
    );
    
    // Calculate new performance metrics
    const newAccuracy = this._calculateAggregatedAccuracy(validUpdates, weights);
    const newLoss = this._calculateAggregatedLoss(validUpdates, weights);
    
    return {
      ...globalModel,
      parameters: newParameters,
      accuracy: newAccuracy,
      loss: newLoss,
      version: this._incrementVersion(globalModel.version),
      updatedAt: new Date().toISOString(),
      aggregationMetadata: {
        participantCount: validUpdates.length,
        aggregationStrategy: this.config.strategy,
        weightingScheme: this.config.weightingScheme,
        byzantineFiltered: updates.length - validUpdates.length
      }
    };
  }

  async _detectByzantine(updates) {
    // Simple Byzantine detection based on outlier analysis
    const accuracies = updates.map(u => u.metadata.localAccuracy);
    const mean = accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length;
    const stddev = Math.sqrt(
      accuracies.reduce((sum, acc) => sum + Math.pow(acc - mean, 2), 0) / accuracies.length
    );
    
    // Filter outliers (more than 2 standard deviations away)
    return updates.filter(update => {
      const accuracy = update.metadata.localAccuracy;
      return Math.abs(accuracy - mean) <= 2 * stddev;
    });
  }

  _calculateWeights(updates) {
    switch (this.config.weightingScheme) {
      case 'uniform':
        return updates.map(() => 1 / updates.length);
      
      case 'data_size': {
        const totalDataSize = updates.reduce((sum, u) => sum + u.metadata.dataSize, 0);
        return updates.map(u => u.metadata.dataSize / totalDataSize);
      }
      
      case 'performance': {
        const totalAccuracy = updates.reduce((sum, u) => sum + u.metadata.localAccuracy, 0);
        return updates.map(u => u.metadata.localAccuracy / totalAccuracy);
      }
      
      default:
        return updates.map(() => 1 / updates.length);
    }
  }

  async _performAggregation(updates, weights) {
    const parameterCount = updates[0].update.modelDelta.length;
    const aggregatedDelta = new Array(parameterCount).fill(0);
    
    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];
      const weight = weights[i];
      
      for (let j = 0; j < parameterCount; j++) {
        aggregatedDelta[j] += update.update.modelDelta[j] * weight;
      }
    }
    
    return aggregatedDelta;
  }

  _calculateAggregatedAccuracy(updates, weights) {
    return updates.reduce((sum, update, i) => 
      sum + update.metadata.localAccuracy * weights[i], 0
    );
  }

  _calculateAggregatedLoss(updates, weights) {
    return updates.reduce((sum, update, i) => 
      sum + update.metadata.localLoss * weights[i], 0
    );
  }

  _incrementVersion(version) {
    const parts = version.split('.');
    const patch = parseInt(parts[2] || '0') + 1;
    return `${parts[0]}.${parts[1]}.${patch}`;
  }
}

class FederatedPerformanceMonitor {
  constructor() {
    this.metrics = new Map();
  }

  recordMetric(federationId, metric, value) {
    if (!this.metrics.has(federationId)) {
      this.metrics.set(federationId, []);
    }
    
    this.metrics.get(federationId).push({
      metric,
      value,
      timestamp: new Date().toISOString()
    });
  }

  getMetrics(federationId) {
    return this.metrics.get(federationId) || [];
  }

  generateReport(federationId) {
    const metrics = this.getMetrics(federationId);
    
    return {
      federationId,
      totalMetrics: metrics.length,
      timeRange: {
        start: metrics[0]?.timestamp,
        end: metrics[metrics.length - 1]?.timestamp
      },
      summary: this._calculateSummaryStats(metrics)
    };
  }

  _calculateSummaryStats(metrics) {
    const grouped = {};
    
    for (const metric of metrics) {
      if (!grouped[metric.metric]) {
        grouped[metric.metric] = [];
      }
      grouped[metric.metric].push(metric.value);
    }
    
    const summary = {};
    for (const [metricName, values] of Object.entries(grouped)) {
      summary[metricName] = {
        count: values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((sum, v) => sum + v, 0) / values.length,
        latest: values[values.length - 1]
      };
    }
    
    return summary;
  }
}

module.exports = {
  FederatedLearningCoordinator,
  FederationSession,
  PrivacyPreservationEngine,
  ModelAggregator,
  FederatedPerformanceMonitor
};
