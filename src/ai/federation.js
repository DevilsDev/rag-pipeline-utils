/**
 * Federated Learning Coordinator
 * Manages distributed learning across multiple participants
 * Extracted from ai/index.js per CLAUDE.md decomposition requirements
 */

"use strict";

// Import the existing federated learning implementation
const federatedLearning = require("./federated-learning");

/**
 * FederatedLearningCoordinator class
 * Coordinates federated learning processes across multiple nodes
 */
class FederatedLearningCoordinator {
  constructor() {
    this.participants = new Map();
    this.rounds = new Map();
    this.modelVersions = new Map();
    this.aggregationStrategies = new Set(["fedavg", "fedprox", "scaffold"]);
  }

  /**
   * Start federated learning round
   * @param {string} tenantId - Tenant identifier
   * @param {object} roundConfig - Round configuration
   * @returns {Promise<string>} Round ID
   */
  async startRound(tenantId, roundConfig) {
    return await federatedLearning.startRound(tenantId, roundConfig);
  }

  /**
   * Register participant in federated learning
   * @param {string} tenantId - Tenant identifier
   * @param {string} participantId - Participant identifier
   * @param {object} capabilities - Participant capabilities
   * @returns {Promise<boolean>} Registration success
   */
  async registerParticipant(tenantId, participantId, capabilities) {
    return await federatedLearning.registerParticipant(
      tenantId,
      participantId,
      capabilities,
    );
  }

  /**
   * Aggregate model updates from participants
   * @param {string} tenantId - Tenant identifier
   * @param {string} roundId - Round identifier
   * @param {Array} updates - Model updates from participants
   * @returns {Promise<object>} Aggregated model
   */
  async aggregateUpdates(tenantId, roundId, updates) {
    return await federatedLearning.aggregateUpdates(tenantId, roundId, updates);
  }

  /**
   * Get federated learning progress
   * @param {string} tenantId - Tenant identifier
   * @param {string} roundId - Round identifier
   * @returns {Promise<object>} Progress information
   */
  async getRoundProgress(tenantId, roundId) {
    return await federatedLearning.getRoundProgress(tenantId, roundId);
  }
}

// Create and export singleton instance
const coordinator = new FederatedLearningCoordinator();

module.exports = coordinator;
module.exports.FederatedLearningCoordinator = FederatedLearningCoordinator;
module.exports.default = module.exports;
