/**
 * @fileoverview Enhanced DAG Engine with Performance Optimizations
 * Enterprise-grade DAG execution engine with advanced concurrency, retry policies,
 * structured logging, and comprehensive error handling
 *
 * @author DevilsDev Team
 * @since 2.1.8
 * @version 2.1.8
 */

const { logger } = require("../utils/structured-logger.js");
const {
  defaultPolicy: defaultRetryPolicy,
} = require("../utils/retry-policy.js");

/**
 * @typedef {Object} DAGNodeOptions
 * @property {number} [timeout=30000] - Node execution timeout in milliseconds
 * @property {number} [retries=0] - Number of retry attempts
 * @property {number} [priority=0] - Execution priority (higher executes first)
 * @property {boolean} [optional=false] - Whether node failure should be ignored
 * @property {Object} [retryPolicy] - Custom retry policy configuration
 * @property {string[]} [tags] - Node tags for categorization
 * @property {Object} [metadata] - Additional node metadata
 */

/**
 * @typedef {Object} ExecutionContext
 * @property {Map} results - Map of completed node results
 * @property {Map} errors - Map of node execution errors
 * @property {Map} fwd - Forward adjacency map for dependencies
 * @property {boolean} continueOnError - Whether to continue on non-critical failures
 * @property {Set} requiredIds - Set of required node IDs
 * @property {any} seed - Initial seed value for source nodes
 * @property {boolean} gracefulDegradation - Enable graceful degradation mode
 * @property {string[]} requiredNodes - Array of required node IDs
 * @property {boolean} retryFailedNodes - Enable retry for failed nodes
 * @property {number} maxRetries - Maximum retry attempts per node
 */

/**
 * @typedef {Object} ExecutionOptions
 * @property {number} [timeout=30000] - Global execution timeout in milliseconds
 * @property {number} [concurrency=5] - Maximum concurrent node executions
 * @property {boolean} [continueOnError=false] - Continue execution on non-critical failures
 * @property {boolean} [gracefulDegradation=false] - Enable graceful degradation mode
 * @property {string[]} [requiredNodes] - Array of required node IDs
 * @property {boolean} [retryFailedNodes=false] - Enable retry for failed nodes
 * @property {number} [maxRetries=3] - Maximum retry attempts per node
 * @property {boolean} [enableMetrics=true] - Enable performance metrics collection
 * @property {boolean} [enableTracing=false] - Enable execution tracing
 */

/**
 * @typedef {Object} NodeMetrics
 * @property {number} executionTime - Node execution time in milliseconds
 * @property {number} retryCount - Number of retry attempts made
 * @property {string} status - Execution status: 'success' | 'failed' | 'skipped'
 * @property {Date} startTime - Execution start timestamp
 * @property {Date} endTime - Execution end timestamp
 * @property {number} memoryUsage - Memory usage during execution
 * @property {string[]} dependencies - List of dependency node IDs
 */

/**
 * Enhanced DAG Node with performance monitoring and retry capabilities
 */
class EnhancedDAGNode {
  /**
   * Create a new DAG node
   * @param {string} id - Unique node identifier
   * @param {Function} run - Async function to execute: (input) => output
   * @param {DAGNodeOptions} [options={}] - Node configuration options
   */
  constructor(id, run, options = {}) {
    if (!id || typeof id !== "string") {
      throw new Error("Node ID must be a non-empty string");
    }
    if (!run || typeof run !== "function") {
      throw new Error("Node run function must be provided");
    }

    this.id = id;
    this.run = run;
    this.inputs = [];
    this.outputs = [];

    // Configuration options
    this.timeout =
      options.timeout || parseInt(process.env.RAG_NODE_TIMEOUT) || 30000;
    this.retries = options.retries || 0;
    this.priority = options.priority || 0;
    this.optional = options.optional || false;
    this.retryPolicy = options.retryPolicy || null;
    this.tags = options.tags || [];
    this.metadata = options.metadata || {};

    // Performance tracking
    this.metrics = {
      executionCount: 0,
      totalExecutionTime: 0,
      successCount: 0,
      failureCount: 0,
      retryCount: 0,
      lastExecutionTime: null,
      avgExecutionTime: 0,
    };

    // Create child logger with node context
    this.logger = logger.child({
      component: "dag-node",
      nodeId: this.id,
      priority: this.priority,
      optional: this.optional,
    });
  }

  /**
   * Add an output connection to another node
   * @param {EnhancedDAGNode} node - Target node to connect to
   * @returns {EnhancedDAGNode} This node for chaining
   */
  addOutput(node) {
    if (!node || !(node instanceof EnhancedDAGNode)) {
      throw new Error(
        "Invalid output node: must be an EnhancedDAGNode instance",
      );
    }

    if (!this.outputs.includes(node)) {
      this.outputs.push(node);
      this.logger.debug("Added output connection", { targetNodeId: node.id });
    }
    if (!node.inputs.includes(this)) {
      node.inputs.push(this);
    }
    return this;
  }

  /**
   * Add an input connection from another node
   * @param {EnhancedDAGNode} node - Source node to connect from
   * @returns {EnhancedDAGNode} This node for chaining
   */
  addInput(node) {
    if (!node || !(node instanceof EnhancedDAGNode)) {
      throw new Error(
        "Invalid input node: must be an EnhancedDAGNode instance",
      );
    }

    if (!this.inputs.includes(node)) {
      this.inputs.push(node);
      this.logger.debug("Added input connection", { sourceNodeId: node.id });
    }
    if (!node.outputs.includes(this)) {
      node.outputs.push(this);
    }
    return this;
  }

  /**
   * Get node dependencies as array of IDs
   * @returns {string[]} Array of dependency node IDs
   */
  getDependencies() {
    return this.inputs.map((node) => node.id);
  }

  /**
   * Check if node has specific tag
   * @param {string} tag - Tag to check for
   * @returns {boolean} Whether node has the tag
   */
  hasTag(tag) {
    return this.tags.includes(tag);
  }

  /**
   * Update node metrics after execution
   * @param {number} executionTime - Execution time in milliseconds
   * @param {boolean} success - Whether execution was successful
   * @param {number} retryCount - Number of retries made
   */
  updateMetrics(executionTime, success, retryCount = 0) {
    this.metrics.executionCount++;
    this.metrics.totalExecutionTime += executionTime;
    this.metrics.retryCount += retryCount;
    this.metrics.lastExecutionTime = executionTime;

    if (success) {
      this.metrics.successCount++;
    } else {
      this.metrics.failureCount++;
    }

    this.metrics.avgExecutionTime =
      this.metrics.totalExecutionTime / this.metrics.executionCount;
  }

  /**
   * Get node performance metrics
   * @returns {NodeMetrics} Node performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      dependencies: this.getDependencies(),
      successRate:
        this.metrics.executionCount > 0
          ? this.metrics.successCount / this.metrics.executionCount
          : 0,
    };
  }

  /**
   * Reset node metrics
   */
  resetMetrics() {
    this.metrics = {
      executionCount: 0,
      totalExecutionTime: 0,
      successCount: 0,
      failureCount: 0,
      retryCount: 0,
      lastExecutionTime: null,
      avgExecutionTime: 0,
    };
  }
}

/**
 * Enhanced DAG Engine with advanced performance and reliability features
 */
class EnhancedDAGEngine {
  /**
   * Create a new enhanced DAG engine
   * @param {Object} [options={}] - Engine configuration options
   */
  constructor(options = {}) {
    this.nodes = new Map();
    this.executionHistory = [];
    this.enableMetrics = options.enableMetrics !== false;
    this.enableTracing = options.enableTracing || false;

    // Default execution options
    this.defaultOptions = {
      timeout: 30000,
      concurrency: parseInt(process.env.RAG_MAX_CONCURRENCY) || 5,
      continueOnError: false,
      gracefulDegradation: false,
      retryFailedNodes: false,
      maxRetries: 3,
      enableMetrics: this.enableMetrics,
      enableTracing: this.enableTracing,
    };

    // Performance tracking
    this.engineMetrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      avgExecutionTime: 0,
      totalExecutionTime: 0,
    };

    // Create engine logger
    this.logger = logger.child({
      component: "enhanced-dag-engine",
      version: "2.1.8",
    });

    this.logger.info("Enhanced DAG Engine initialized", {
      defaultConcurrency: this.defaultOptions.concurrency,
      metricsEnabled: this.enableMetrics,
      tracingEnabled: this.enableTracing,
    });
  }

  /**
   * Add a node to the DAG
   * @param {string} id - Unique node identifier
   * @param {Function} run - Async function to execute
   * @param {DAGNodeOptions} [options={}] - Node configuration
   * @returns {EnhancedDAGNode} The created node
   */
  addNode(id, run, options = {}) {
    if (this.nodes.has(id)) {
      throw new Error(`Node with ID '${id}' already exists`);
    }

    const node = new EnhancedDAGNode(id, run, options);
    this.nodes.set(id, node);

    this.logger.debug("Node added to DAG", {
      nodeId: id,
      priority: node.priority,
      optional: node.optional,
      timeout: node.timeout,
    });

    return node;
  }

  /**
   * Get a node by ID
   * @param {string} id - Node identifier
   * @returns {EnhancedDAGNode|undefined} The node or undefined if not found
   */
  getNode(id) {
    return this.nodes.get(id);
  }

  /**
   * Connect two nodes
   * @param {string} fromId - Source node ID
   * @param {string} toId - Target node ID
   * @returns {EnhancedDAGEngine} This engine for chaining
   */
  connect(fromId, toId) {
    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);

    if (!fromNode) {
      throw new Error(`Source node '${fromId}' not found`);
    }
    if (!toNode) {
      throw new Error(`Target node '${toId}' not found`);
    }

    fromNode.addOutput(toNode);

    this.logger.debug("Nodes connected", {
      fromNodeId: fromId,
      toNodeId: toId,
    });

    return this;
  }

  /**
   * Validate DAG for cycles and structural integrity
   * @throws {Error} If DAG is invalid
   */
  validate() {
    this.logger.debug("Validating DAG structure");

    // Check for cycles using DFS
    const visited = new Set();
    const recursionStack = new Set();

    const hasCycle = (nodeId) => {
      if (recursionStack.has(nodeId)) {
        return true;
      }
      if (visited.has(nodeId)) {
        return false;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const node = this.nodes.get(nodeId);
      for (const output of node.outputs) {
        if (hasCycle(output.id)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const nodeId of this.nodes.keys()) {
      if (hasCycle(nodeId)) {
        throw new Error(`Cycle detected in DAG involving node: ${nodeId}`);
      }
    }

    // Validate node integrity
    for (const [nodeId, node] of this.nodes) {
      // Check that all input/output connections are bidirectional
      for (const input of node.inputs) {
        if (!input.outputs.includes(node)) {
          throw new Error(
            `Broken bidirectional connection: ${input.id} -> ${nodeId}`,
          );
        }
      }
      for (const output of node.outputs) {
        if (!output.inputs.includes(node)) {
          throw new Error(
            `Broken bidirectional connection: ${nodeId} -> ${output.id}`,
          );
        }
      }
    }

    this.logger.info("DAG validation completed successfully", {
      nodeCount: this.nodes.size,
    });
  }

  /**
   * Get topological order of nodes for execution
   * @returns {EnhancedDAGNode[]} Nodes in execution order
   */
  getTopologicalOrder() {
    const visited = new Set();
    const order = [];

    const visit = (node) => {
      if (visited.has(node.id)) {
        return;
      }

      visited.add(node.id);

      // Visit dependencies first (sorted by priority)
      const sortedInputs = [...node.inputs].sort(
        (a, b) => b.priority - a.priority,
      );
      for (const input of sortedInputs) {
        visit(input);
      }

      order.push(node);
    };

    // Start with nodes that have no inputs, sorted by priority
    const sourceNodes = Array.from(this.nodes.values())
      .filter((node) => node.inputs.length === 0)
      .sort((a, b) => b.priority - a.priority);

    for (const node of sourceNodes) {
      visit(node);
    }

    // Ensure all nodes are included
    for (const node of this.nodes.values()) {
      visit(node);
    }

    this.logger.debug("Topological order computed", {
      nodeCount: order.length,
      sourceNodes: sourceNodes.map((n) => n.id),
    });

    return order;
  }

  /**
   * Execute a single node with comprehensive error handling and retry logic
   * @param {EnhancedDAGNode} node - Node to execute
   * @param {ExecutionContext} context - Execution context
   * @returns {Promise<any>} Node execution result
   */
  async executeNode(node, context) {
    const { results, errors, seed, maxRetries } = context;
    const startTime = Date.now();
    let retryCount = 0;

    const correlationId = this.logger.getContext()?.correlationId;

    node.logger.debug("Starting node execution", {
      correlationId,
      dependencies: node.getDependencies(),
      hasResults: node.inputs.map((dep) => results.has(dep.id)),
    });

    try {
      // Prepare input data from dependencies
      let input = seed;
      if (node.inputs.length > 0) {
        input = {};
        for (const dep of node.inputs) {
          if (results.has(dep.id)) {
            input[dep.id] = results.get(dep.id);
          }
        }
      }

      // Create execution function with timeout
      const executeWithTimeout = async () => {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(
              new Error(
                `Node ${node.id} execution timeout after ${node.timeout}ms`,
              ),
            );
          }, node.timeout);
        });

        return Promise.race([node.run(input), timeoutPromise]);
      };

      // Use retry policy if configured
      let result;
      if (node.retryPolicy || (node.retries > 0 && maxRetries > 0)) {
        const retryPolicy = node.retryPolicy || defaultRetryPolicy;

        result = await retryPolicy.execute(executeWithTimeout, {
          nodeId: node.id,
          correlationId,
        });
        retryCount = retryPolicy.getMetrics().retryBudget.currentRetries;
      } else {
        result = await executeWithTimeout();
      }

      const executionTime = Date.now() - startTime;

      // Update metrics
      if (this.enableMetrics) {
        node.updateMetrics(executionTime, true, retryCount);
      }

      node.logger.info("Node execution completed successfully", {
        correlationId,
        executionTime,
        retryCount,
        resultType: typeof result,
      });

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;

      // Update metrics
      if (this.enableMetrics) {
        node.updateMetrics(executionTime, false, retryCount);
      }

      // Handle optional node failures
      if (node.optional && context.gracefulDegradation) {
        node.logger.warn(
          "Optional node failed, continuing with graceful degradation",
          {
            correlationId,
            error: error.message,
            executionTime,
            retryCount,
          },
        );
        return Symbol("failed-optional-node");
      }

      // Store error for required nodes
      errors.set(node.id, error);

      node.logger.error("Node execution failed", {
        correlationId,
        error: error.message,
        errorCode: error.code,
        executionTime,
        retryCount,
        stack: error.stack,
      });

      // Re-throw for required nodes
      throw error;
    }
  }

  /**
   * Execute the DAG with advanced concurrency and error handling
   * @param {any} [seed] - Initial seed value for source nodes
   * @param {ExecutionOptions} [options={}] - Execution options
   * @returns {Promise<Object>} Execution results
   */
  async execute(seed, options = {}) {
    const executionId = require("crypto").randomUUID();
    const startTime = Date.now();

    // Merge options with defaults
    const config = { ...this.defaultOptions, ...options };

    return this.logger.withCorrelation(executionId, async () => {
      this.logger.info("Starting DAG execution", {
        executionId,
        seedType: typeof seed,
        nodeCount: this.nodes.size,
        concurrency: config.concurrency,
        timeout: config.timeout,
      });

      try {
        // Validate DAG before execution
        this.validate();

        // Initialize execution state
        const results = new Map();
        const errors = new Map();
        const order = this.getTopologicalOrder();

        // Create execution context
        const context = {
          results,
          errors,
          seed,
          continueOnError: config.continueOnError,
          gracefulDegradation: config.gracefulDegradation,
          retryFailedNodes: config.retryFailedNodes,
          maxRetries: config.maxRetries,
        };

        // Execute nodes with concurrency control
        const semaphore = new Semaphore(config.concurrency);
        const nodePromises = new Map();

        for (const node of order) {
          const promise = semaphore.acquire().then(async (release) => {
            try {
              // Wait for dependencies to complete
              const depPromises = node.inputs
                .map((dep) => nodePromises.get(dep.id))
                .filter(Boolean);

              await Promise.all(depPromises);

              // Execute the node
              const result = await this.executeNode(node, context);

              if (
                typeof result !== "symbol" ||
                result.description !== "failed-optional-node"
              ) {
                results.set(node.id, result);
              }

              return result;
            } finally {
              release();
            }
          });

          nodePromises.set(node.id, promise);
        }

        // Wait for all nodes to complete
        const allResults = await Promise.allSettled(
          Array.from(nodePromises.values()),
        );

        const executionTime = Date.now() - startTime;

        // Update engine metrics
        if (this.enableMetrics) {
          this.engineMetrics.totalExecutions++;
          this.engineMetrics.totalExecutionTime += executionTime;
          this.engineMetrics.avgExecutionTime =
            this.engineMetrics.totalExecutionTime /
            this.engineMetrics.totalExecutions;

          if (errors.size === 0) {
            this.engineMetrics.successfulExecutions++;
          } else {
            this.engineMetrics.failedExecutions++;
          }
        }

        // Create execution summary
        const summary = {
          executionId,
          success: errors.size === 0,
          executionTime,
          nodesExecuted: results.size,
          totalNodes: this.nodes.size,
          errors: Array.from(errors.entries()).map(([id, error]) => ({
            nodeId: id,
            message: error.message,
            code: error.code,
          })),
        };

        // Store execution history
        if (this.enableTracing) {
          this.executionHistory.push({
            ...summary,
            timestamp: new Date().toISOString(),
            results: Object.fromEntries(results),
          });

          // Keep only last 100 executions
          if (this.executionHistory.length > 100) {
            this.executionHistory.shift();
          }
        }

        this.logger.info("DAG execution completed", summary);

        // Return results
        return {
          results: Object.fromEntries(results),
          errors: Object.fromEntries(errors),
          summary,
          metrics: this.enableMetrics ? this.getMetrics() : null,
        };
      } catch (error) {
        const executionTime = Date.now() - startTime;

        if (this.enableMetrics) {
          this.engineMetrics.totalExecutions++;
          this.engineMetrics.failedExecutions++;
        }

        this.logger.error("DAG execution failed", {
          executionId,
          error: error.message,
          executionTime,
          stack: error.stack,
        });

        throw error;
      }
    });
  }

  /**
   * Get comprehensive performance metrics
   * @returns {Object} Performance metrics
   */
  getMetrics() {
    const nodeMetrics = {};
    for (const [id, node] of this.nodes) {
      nodeMetrics[id] = node.getMetrics();
    }

    return {
      engine: this.engineMetrics,
      nodes: nodeMetrics,
      summary: {
        totalNodes: this.nodes.size,
        avgSuccessRate:
          Object.values(nodeMetrics).reduce(
            (sum, metrics) => sum + metrics.successRate,
            0,
          ) / this.nodes.size,
      },
    };
  }

  /**
   * Reset all metrics
   */
  resetMetrics() {
    this.engineMetrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      avgExecutionTime: 0,
      totalExecutionTime: 0,
    };

    for (const node of this.nodes.values()) {
      node.resetMetrics();
    }

    this.executionHistory = [];
  }

  /**
   * Get execution history (if tracing is enabled)
   * @returns {Array} Execution history
   */
  getExecutionHistory() {
    return [...this.executionHistory];
  }
}

/**
 * Semaphore for concurrency control
 */
class Semaphore {
  constructor(maxConcurrency) {
    this.maxConcurrency = maxConcurrency;
    this.currentCount = 0;
    this.waitQueue = [];
  }

  async acquire() {
    return new Promise((resolve) => {
      if (this.currentCount < this.maxConcurrency) {
        this.currentCount++;
        resolve(() => this.release());
      } else {
        this.waitQueue.push(() => {
          this.currentCount++;
          resolve(() => this.release());
        });
      }
    });
  }

  release() {
    this.currentCount--;
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      next();
    }
  }
}

/**
 * Create enhanced DAG engine instance
 * @param {Object} [options={}] - Engine configuration
 * @returns {EnhancedDAGEngine} DAG engine instance
 */
function createEnhancedDAG(options = {}) {
  return new EnhancedDAGEngine(options);
}

module.exports = {
  EnhancedDAGEngine,
  EnhancedDAGNode,
  Semaphore,
  createEnhancedDAG,
};

// CommonJS/ESM interop
module.exports.default = module.exports;
