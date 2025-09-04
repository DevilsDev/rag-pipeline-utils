/**
 * Model Trainer - In-memory deterministic training orchestration
 *
 * Google-style implementation with dependency injection for clocks/RNG.
 * Provides training job management, hyperparameter optimization, and model deployment.
 *
 * @module ModelTrainer
 * @exports {ModelTrainer, modelTrainer}
 */

const EventEmitter = require("events");

class ModelTrainer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.now = options.now || (() => Date.now());
    this.sleep =
      options.sleep ||
      ((ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 5))));
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
   * @param {object} config - Training configuration
   * @returns {string} Job ID
   */
  createTrainingJob(tenantId, config) {
    if (!tenantId || !config) {
      const error = new Error("Tenant ID and config are required");
      error.code = "INVALID_ARGUMENT";
      throw error;
    }

    const jobId = `job-${++this.jobCounter}`;
    const job = {
      id: jobId,
      tenantId,
      config,
      status: "created",
      createdAt: this.now(),
      progress: 0,
    };

    this.jobs.set(jobId, job);
    return jobId;
  }

  /**
   * Start training for a job
   * @param {string} jobId - Job identifier
   * @returns {Promise<void>}
   */
  async startTraining(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      const error = new Error(`Training job not found: ${jobId}`);
      error.code = "NOT_FOUND";
      throw error;
    }

    job.status = "running";
    job.startedAt = this.now();
    this.emit("training_started", { jobId, tenantId: job.tenantId });

    // Simulate training with tiny delay
    await this.sleep(2);

    job.status = "completed";
    job.completedAt = this.now();
    job.progress = 100;
    this.emit("training_completed", {
      jobId,
      tenantId: job.tenantId,
      status: "completed",
    });
  }

  /**
   * Optimize hyperparameters
   * @param {string} tenantId - Tenant identifier
   * @param {object} config - Optimization configuration
   * @returns {string} Optimization ID
   */
  optimizeHyperparameters(tenantId, config) {
    if (!tenantId || !config) {
      const error = new Error("Tenant ID and config are required");
      error.code = "INVALID_ARGUMENT";
      throw error;
    }

    const optId = `opt-${++this.optCounter}`;
    const optimization = {
      id: optId,
      tenantId,
      config,
      status: "running",
      createdAt: this.now(),
      trials: [
        { params: { lr: 0.001, batch_size: 32 }, score: 0.85 },
        { params: { lr: 0.01, batch_size: 64 }, score: 0.92 },
        { params: { lr: 0.005, batch_size: 32 }, score: 0.89 },
      ],
    };

    this.optimizations.set(optId, optimization);

    // Emit completion immediately for deterministic tests
    setImmediate(() => {
      optimization.status = "completed";
      optimization.completedAt = this.now();
      this.emit("hpo_completed", { optId, tenantId, bestScore: 0.92 });
    });

    return optId;
  }

  /**
   * Get optimization results
   * @param {string} optId - Optimization identifier
   * @returns {Array} Array of trials
   */
  getOptimizationResults(optId) {
    const optimization = this.optimizations.get(optId);
    if (!optimization) {
      const error = new Error(`Optimization not found: ${optId}`);
      error.code = "NOT_FOUND";
      throw error;
    }

    return optimization.trials;
  }

  /**
   * Deploy a trained model
   * @param {string} jobId - Training job identifier
   * @param {object} options - Deployment options
   * @returns {string} Deployment ID
   */
  deployModel(jobId, options = {}) {
    const job = this.jobs.get(jobId);
    if (!job) {
      const error = new Error(`Training job not found: ${jobId}`);
      error.code = "NOT_FOUND";
      throw error;
    }

    if (job.status !== "completed") {
      const error = new Error("Job must be completed before deployment");
      error.code = "FAILED_PRECONDITION";
      throw error;
    }

    const deploymentId = `deploy-${++this.deployCounter}`;
    const deployment = {
      id: deploymentId,
      jobId,
      tenantId: job.tenantId,
      environment: options.environment || "staging",
      status: "deployed",
      deployedAt: this.now(),
    };

    this.deployments.set(deploymentId, deployment);
    this.emit("model_deployed", {
      deploymentId,
      jobId,
      environment: deployment.environment,
    });

    return deploymentId;
  }

  /**
   * Get deployment status
   * @param {string} deploymentId - Deployment identifier
   * @returns {object} Deployment status
   */
  getDeploymentStatus(deploymentId) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      const error = new Error(`Deployment not found: ${deploymentId}`);
      error.code = "NOT_FOUND";
      throw error;
    }

    return {
      id: deployment.id,
      status: deployment.status,
      environment: deployment.environment,
      deployedAt: deployment.deployedAt,
    };
  }

  /**
   * Clear all data (for testing)
   */
  clear() {
    this.jobs.clear();
    this.optimizations.clear();
    this.deployments.clear();
    this.jobCounter = 0;
    this.optCounter = 0;
    this.deployCounter = 0;
  }
}

// Default instance
const modelTrainer = new ModelTrainer();

module.exports = { ModelTrainer, modelTrainer };
