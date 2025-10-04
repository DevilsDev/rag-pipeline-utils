/**
 * Adaptive Retrieval Engine
 * Provides intelligent document retrieval with adaptive algorithms
 * Extracted from ai/index.js per CLAUDE.md decomposition requirements
 */

"use strict";

// Import the existing adaptive retrieval implementation
const adaptiveRetrieval = require("./adaptive-retrieval");

/**
 * AdaptiveRetrievalEngine class
 * Manages intelligent document retrieval with performance optimization
 */
class AdaptiveRetrievalEngine {
  constructor() {
    this.algorithms = new Map();
    this.performanceMetrics = new Map();
    this.adaptationThreshold = 0.1;
  }

  /**
   * Process retrieval query with adaptive algorithms
   * @param {string} tenantId - Tenant identifier
   * @param {string} query - Search query
   * @param {object} options - Retrieval options
   * @returns {Promise<object>} Retrieval results
   */
  async retrieveDocuments(tenantId, query, options = {}) {
    return await adaptiveRetrieval.retrieveDocuments(tenantId, query, options);
  }

  /**
   * Optimize retrieval algorithm based on performance data
   * @param {string} tenantId - Tenant identifier
   * @param {object} performanceData - Performance metrics
   * @returns {Promise<object>} Optimization results
   */
  async optimizeRetrieval(tenantId, performanceData) {
    return await adaptiveRetrieval.optimizeRetrieval(tenantId, performanceData);
  }

  /**
   * Get current algorithm configuration
   * @param {string} tenantId - Tenant identifier
   * @returns {Promise<object>} Current algorithm configuration
   */
  async getAlgorithmConfig(tenantId) {
    return await adaptiveRetrieval.getAlgorithmConfig(tenantId);
  }

  /**
   * Update retrieval strategy
   * @param {string} tenantId - Tenant identifier
   * @param {string} strategy - New retrieval strategy
   * @returns {Promise<boolean>} Success status
   */
  async updateStrategy(tenantId, strategy) {
    return await adaptiveRetrieval.updateStrategy(tenantId, strategy);
  }
}

// Create and export singleton instance
const engine = new AdaptiveRetrievalEngine();

module.exports = engine;
module.exports.AdaptiveRetrievalEngine = AdaptiveRetrievalEngine;
module.exports.default = module.exports;
