/**
 * Model Training Orchestrator
 * Provides model training coordination and job management
 * Extracted from ai/index.js per CLAUDE.md decomposition requirements
 */

"use strict";

// Import the existing model training implementation
const modelTraining = require("./model-training");

/**
 * ModelTrainingOrchestrator class
 * Coordinates and manages model training jobs across tenants
 */
class ModelTrainingOrchestrator {
  constructor() {
    this.jobs = new Map();
    this.optimizations = new Map();
    this.deployments = new Map();
    this.jobCounter = 0;
    this.optCounter = 0;
    this.deployCounter = 0;
  }

  /**
   * Create a training job
   * @param {string} tenantId - Tenant identifier
   * @param {object} trainingConfig - Training configuration
   * @returns {Promise<string>} Job ID
   */
  async createTrainingJob(tenantId, trainingConfig) {
    return await modelTraining.createTrainingJob(tenantId, trainingConfig);
  }

  /**
   * Get training job status
   * @param {string} jobId - Job identifier
   * @returns {Promise<object>} Job status
   */
  async getJobStatus(jobId) {
    return await modelTraining.getJobStatus(jobId);
  }

  /**
   * Optimize model configuration
   * @param {object} modelConfig - Model configuration
   * @returns {Promise<object>} Optimized configuration
   */
  async optimizeModel(modelConfig) {
    return await modelTraining.optimizeModel(modelConfig);
  }

  /**
   * Deploy trained model
   * @param {string} jobId - Training job identifier
   * @param {object} deployConfig - Deployment configuration
   * @returns {Promise<string>} Deployment ID
   */
  async deployModel(jobId, deployConfig) {
    return await modelTraining.deployModel(jobId, deployConfig);
  }
}

// Create and export singleton instance
const orchestrator = new ModelTrainingOrchestrator();

module.exports = orchestrator;
module.exports.ModelTrainingOrchestrator = ModelTrainingOrchestrator;
module.exports.default = module.exports;
