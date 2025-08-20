/**
 * Federated Learning Coordinator - Extracted from monolithic AI module
 * Handles federated learning orchestration and participant management
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

class FederatedLearningCoordinator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = {
      minParticipants: options.minParticipants || 2,
      maxParticipants: options.maxParticipants || 100,
      roundDuration: options.roundDuration || 300000,
      convergenceThreshold: options.convergenceThreshold || 0.001,
      maxRounds: options.maxRounds || 100,
      ...options
    };
    this.federations = new Map();
    this.participants = new Map();
    this.globalModels = new Map();
  }

  async createFederation(tenantId, modelConfig, federationConfig = {}) {
    const federationId = crypto.randomUUID();
    const federation = {
      id: federationId,
      tenantId,
      modelConfig,
      status: 'created',
      currentRound: 0,
      minParticipants: federationConfig.minParticipants || this.config.minParticipants,
      maxParticipants: federationConfig.maxParticipants || this.config.maxParticipants,
      convergenceThreshold: federationConfig.convergenceThreshold || this.config.convergenceThreshold,
      maxRounds: federationConfig.maxRounds || this.config.maxRounds,
      privacy: federationConfig.privacy || {
        differentialPrivacy: { enabled: false, epsilon: 1.0 },
        secureAggregation: { enabled: false }
      },
      createdAt: Date.now(),
      participants: [],
      convergenceHistory: []
    };
    
    this.federations.set(federationId, federation);
    this.emit('federationCreated', { federationId, tenantId });
    return federationId;
  }

  async registerParticipant(federationId, participantInfo) {
    const federation = this.federations.get(federationId);
    if (!federation) {
      throw new Error(`Federation ${federationId} not found`);
    }

    // Validate participant eligibility
    if (participantInfo.dataSize < 100) {
      throw new Error('Participant not eligible: Insufficient data size');
    }
    if (participantInfo.computeCapacity < 0.1) {
      throw new Error('Participant not eligible: Insufficient compute capacity');
    }

    const participantId = crypto.randomUUID();
    const participant = {
      id: participantId,
      federationId,
      tenantId: participantInfo.tenantId,
      status: 'active',
      dataSize: participantInfo.dataSize || 1000,
      computeCapacity: participantInfo.computeCapacity || 0.5,
      privacyLevel: participantInfo.privacyLevel || 'standard',
      performance: {
        rounds: 0,
        accuracy: 0.5,
        loss: 1.0,
        contributionScore: 0.0
      },
      joinedAt: Date.now()
    };

    this.participants.set(participantId, participant);
    federation.participants.push(participantId);

    this.emit('participantRegistered', { federationId, participantId, tenantId: participantInfo.tenantId });
    return participantId;
  }

  async startFederatedTraining(federationId) {
    const federation = this.federations.get(federationId);
    if (!federation) {
      throw new Error(`Federation ${federationId} not found`);
    }

    if (federation.participants.length < federation.minParticipants) {
      throw new Error(`Insufficient participants: ${federation.participants.length} < ${federation.minParticipants}`);
    }

    federation.status = 'training';
    federation.startedAt = Date.now();
    
    this.emit('federatedTrainingStarted', { 
      federationId, 
      participantCount: federation.participants.length 
    });

    // Simulate federated training rounds
    for (let round = 1; round <= federation.maxRounds; round++) {
      federation.currentRound = round;
      
      // Simulate round execution
      const roundResults = await this._executeTrainingRound(federation, round);
      
      // Check for convergence
      if (roundResults.convergence < federation.convergenceThreshold) {
        federation.status = 'converged';
        break;
      }
      
      // Add small delay between rounds
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (federation.status === 'training') {
      federation.status = 'completed';
    }
    
    federation.completedAt = Date.now();
    
    this.emit('federatedTrainingCompleted', {
      federationId,
      rounds: federation.currentRound,
      status: federation.status,
      finalAccuracy: federation.convergenceHistory[federation.convergenceHistory.length - 1]?.accuracy || 0.8
    });

    return {
      federationId,
      status: federation.status,
      rounds: federation.currentRound,
      participants: federation.participants.length
    };
  }

  async getFederationStatus(federationId) {
    const federation = this.federations.get(federationId);
    if (!federation) {
      throw new Error(`Federation ${federationId} not found`);
    }

    return {
      id: federationId,
      status: federation.status,
      currentRound: federation.currentRound,
      participantCount: federation.participants.length,
      convergenceHistory: federation.convergenceHistory,
      createdAt: federation.createdAt,
      startedAt: federation.startedAt,
      completedAt: federation.completedAt
    };
  }

  async getParticipantStatus(participantId) {
    const participant = this.participants.get(participantId);
    if (!participant) {
      throw new Error(`Participant ${participantId} not found`);
    }

    return participant;
  }

  async updateParticipantModel(participantId, modelUpdate) {
    const participant = this.participants.get(participantId);
    if (!participant) {
      throw new Error(`Participant ${participantId} not found`);
    }

    // Simulate model update processing
    participant.performance.rounds++;
    participant.performance.accuracy = Math.min(0.95, participant.performance.accuracy + 0.05);
    participant.performance.loss = Math.max(0.05, participant.performance.loss - 0.05);
    participant.performance.contributionScore += modelUpdate.contributionScore || 0.1;

    this.emit('participantModelUpdated', {
      participantId,
      federationId: participant.federationId,
      performance: participant.performance
    });

    return {
      participantId,
      updateAccepted: true,
      newPerformance: participant.performance
    };
  }

  async aggregateModels(federationId, participantUpdates) {
    const federation = this.federations.get(federationId);
    if (!federation) {
      throw new Error(`Federation ${federationId} not found`);
    }

    // Simulate federated averaging
    const aggregatedModel = {
      id: crypto.randomUUID(),
      federationId,
      round: federation.currentRound,
      participantCount: participantUpdates.length,
      aggregationMethod: 'federated_averaging',
      weights: Array.from({ length: 100 }, () => Math.random()), // Simulated model weights
      performance: {
        accuracy: 0.7 + Math.random() * 0.2,
        loss: 0.1 + Math.random() * 0.2,
        convergence: Math.random() * 0.01
      },
      createdAt: Date.now()
    };

    // Store global model
    this.globalModels.set(aggregatedModel.id, aggregatedModel);

    this.emit('modelsAggregated', {
      federationId,
      modelId: aggregatedModel.id,
      round: federation.currentRound,
      participantCount: participantUpdates.length
    });

    return aggregatedModel;
  }

  async _executeTrainingRound(federation, roundNumber) {
    this.emit('trainingRoundStarted', {
      federationId: federation.id,
      round: roundNumber,
      participantCount: federation.participants.length
    });

    // Simulate participant model updates
    const participantUpdates = federation.participants.map(participantId => {
      const participant = this.participants.get(participantId);
      return {
        participantId,
        modelUpdate: {
          weights: Array.from({ length: 100 }, () => Math.random()),
          accuracy: 0.6 + Math.random() * 0.3,
          loss: 0.1 + Math.random() * 0.3,
          contributionScore: Math.random() * 0.2
        }
      };
    });

    // Aggregate models
    const aggregatedModel = await this.aggregateModels(federation.id, participantUpdates);

    // Update convergence history
    const convergenceMetric = {
      round: roundNumber,
      accuracy: aggregatedModel.performance.accuracy,
      loss: aggregatedModel.performance.loss,
      convergence: aggregatedModel.performance.convergence,
      participantCount: participantUpdates.length,
      timestamp: Date.now()
    };

    federation.convergenceHistory.push(convergenceMetric);

    this.emit('trainingRoundCompleted', {
      federationId: federation.id,
      round: roundNumber,
      convergence: convergenceMetric.convergence,
      accuracy: convergenceMetric.accuracy
    });

    return convergenceMetric;
  }

  async getGlobalModel(federationId) {
    const federation = this.federations.get(federationId);
    if (!federation) {
      throw new Error(`Federation ${federationId} not found`);
    }

    // Find the latest global model for this federation
    const federationModels = Array.from(this.globalModels.values())
      .filter(model => model.federationId === federationId)
      .sort((a, b) => b.round - a.round);

    if (federationModels.length === 0) {
      throw new Error(`No global model found for federation ${federationId}`);
    }

    return federationModels[0];
  }

  async removeParticipant(participantId) {
    const participant = this.participants.get(participantId);
    if (!participant) {
      throw new Error(`Participant ${participantId} not found`);
    }

    const federation = this.federations.get(participant.federationId);
    if (federation) {
      federation.participants = federation.participants.filter(id => id !== participantId);
    }

    this.participants.delete(participantId);

    this.emit('participantRemoved', {
      participantId,
      federationId: participant.federationId
    });

    return true;
  }
}

module.exports = { FederatedLearningCoordinator };
