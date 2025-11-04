/**
 * Version: 2.0.2
 * Path: /src/dag/dag-engine.js
 * Description: DAG executor for chained RAG pipelines with cycle detection, error handling, and optional concurrency
 * Author: Ali Kahwaji
 */

const DAGNode = require('./dag-node.js');
const {
  buildAdjacency,
  getSinkIds,
  topologicalSort,
  validateDAG,
  validateTopology,
} = require('./core/topology-validation.js');
const ExecutionScheduler = require('./core/execution-scheduler.js');
const ErrorContext = require('./core/error-context.js');

class DAG {
  constructor() {
    this.nodes = new Map();
    this.scheduler = new ExecutionScheduler({
      getSinkIds: (fwd) => getSinkIds(fwd),
    });
    this.errorContext = new ErrorContext();
  }

  addNode(id, _fn, options = {}) {
    if (this.nodes.has(id)) {
      throw new Error(`Node with ID "${id}" already exists`);
    }
    const node = new DAGNode(id, _fn, options);
    this.nodes.set(id, node);
    return node;
  }

  connect(fromId, toId) {
    const from = this.nodes.get(fromId);
    const to = this.nodes.get(toId);
    if (!from || !to) throw new Error(`Invalid edge: ${fromId} → ${toId}`);
    from.outputs.push(to);
    to.inputs.push(from);
  }

  /**
   * Parse and normalize execute parameters
   * @param {any} seedOrOptions - Seed data or options object
   * @param {Object} _options - Additional options (if first param is seed)
   * @returns {Object} - Normalized {seed, options} object
   */
  _parseExecuteParams(seedOrOptions, _options = {}) {
    // Handle parameter overloading
    let seed, options;
    if (
      seedOrOptions &&
      typeof seedOrOptions === 'object' &&
      !Array.isArray(seedOrOptions) &&
      ('concurrency' in seedOrOptions ||
        'timeout' in seedOrOptions ||
        'continueOnError' in seedOrOptions ||
        'enableCheckpoints' in seedOrOptions ||
        'checkpointId' in seedOrOptions ||
        'requiredNodes' in seedOrOptions ||
        'returnFormat' in seedOrOptions ||
        'retryFailedNodes' in seedOrOptions ||
        'maxRetries' in seedOrOptions ||
        'gracefulDegradation' in seedOrOptions)
    ) {
      // First parameter is options
      options = seedOrOptions;
      seed = options.seed;
    } else {
      // First parameter is seed
      seed = seedOrOptions;
      options = _options;
    }

    // Extract options with defaults
    const normalizedOptions = {
      concurrency: parseInt(process.env.RAG_MAX_CONCURRENCY, 10) || null,
      timeout: null,
      continueOnError: false,
      gracefulDegradation: false,
      enableCheckpoints: false,
      checkpointId: null,
      requiredNodes: [],
      returnFormat: 'auto',
      retryFailedNodes: false,
      maxRetries: 3,
      ...options,
    };

    return { seed, options: normalizedOptions };
  }

  /**
   * Execute all nodes in topological order with concurrency control
   * @param {Array} order - Topologically sorted nodes
   * @param {Object} context - Execution context
   * @returns {Promise<void>}
   */
  async _runAllNodes(order, context) {
    return this.scheduler.scheduleExecution(order, context);
  }

  /**
   * Check if a node can be executed based on dependency satisfaction
   * @param {DAGNode} node - Node to check
   * @param {Object} context - Execution context
   * @returns {boolean}
   */
  _canExecuteNode(node, context) {
    return this.scheduler.canExecuteNode(node, context);
  }

  /**
   * Initialize execution state and validate DAG
   * @returns {Object} - Execution state object
   */
  _initializeExecutionState() {
    this.validate();

    // Initialize execution state
    const results = new Map();
    const errors = new Map();
    const order = this.topoSort();
    const { fwd, rev } = this._buildAdjacency();
    const requiredIds = this._getRequiredIds(fwd, rev);

    return { results, errors, order, fwd, rev, requiredIds };
  }

  /**
   * Handle execution errors with appropriate wrapping
   * @param {Error} error - Error to handle
   * @throws {Error} - Appropriately wrapped error
   */
  _handleExecutionError(error) {
    throw this.errorContext.wrapExecutionError(error);
  }

  /**
   * Execute function with optional timeout
   * @param {Function} runFn - Function to execute
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<void>}
   */
  async _executeWithTimeout(runFn, timeout) {
    return this.scheduler.executeWithTimeout(runFn, timeout);
  }

  /**
   * Process execution results and handle checkpointing
   * @param {Map} results - Node execution results
   * @param {Map} errors - Node execution errors
   * @param {Map} fwd - Forward adjacency map
   * @param {Object} options - Processing options
   * @returns {any} - Processed results
   */
  _processResults(results, errors, fwd, options) {
    const {
      gracefulDegradation,
      retryFailedNodes,
      enableCheckpoints,
      checkpointId,
    } = options;

    // Check for multiple errors first
    const aggregatedError = this.errorContext.aggregateErrors(errors);
    if (aggregatedError && errors.size >= 2) {
      throw aggregatedError;
    }

    // Determine sink nodes and successful sinks
    const sinkIds = this._getSinkIds(fwd);

    if (sinkIds.length === 0) {
      // Check for single error first before generic "no sink nodes"
      if (errors.size === 1) {
        throw [...errors.values()][0];
      }
      throw new Error('DAG has no sink nodes - no final output available');
    }

    const successfulSinks = sinkIds.filter((id) => results.has(id));

    if (successfulSinks.length === 0) {
      // Check for single error first before generic "no sink nodes"
      if (errors.size === 1) {
        throw [...errors.values()][0];
      }
      throw new Error('DAG has no sink nodes - no final output available');
    }

    // Save checkpoint if enabled
    if (enableCheckpoints && checkpointId) {
      this.saveCheckpoint(checkpointId, { results, errors });
    }

    // For graceful degradation or retry scenarios, always return object with Map-like methods
    if (gracefulDegradation || retryFailedNodes || successfulSinks.length > 1) {
      // Multiple successful sinks OR graceful degradation - return POJO with sink keys enumerable and non-enumerable helpers
      const sinkEntries = successfulSinks.map((id) => [id, results.get(id)]);
      const obj = Object.fromEntries(sinkEntries);

      // Attach non-enumerable helpers backed by ALL results
      Object.defineProperty(obj, '__allResults', {
        value: new Map(results),
        enumerable: false,
      });
      Object.defineProperty(obj, 'get', {
        value: (k) => obj.__allResults.get(k),
        enumerable: false,
      });
      Object.defineProperty(obj, 'has', {
        value: (k) => obj.__allResults.has(k),
        enumerable: false,
      });

      return obj;
    } else if (successfulSinks.length === 1) {
      // Single successful sink without graceful degradation - return its value directly
      return results.get(successfulSinks[0]);
    }
  }

  /**
   * Executes the DAG with optional seed data and configuration
   * @param {any} seedOrOptions - Seed data or options object
   * @param {Object} _options - Additional options (if first param is seed)
   * @returns {Promise<any>} - Execution results
   */
  async execute(seedOrOptions, _options = {}) {
    const { seed, options } = this._parseExecuteParams(seedOrOptions, _options);
    const {
      concurrency,
      timeout,
      continueOnError,
      gracefulDegradation,
      enableCheckpoints,
      checkpointId,
      requiredNodes,
      returnFormat,
      retryFailedNodes,
      maxRetries,
    } = options;

    try {
      const executionState = this._initializeExecutionState();

      const { results, errors, order, fwd, requiredIds } = executionState;

      // Execute nodes with optional timeout
      await this._executeWithTimeout(
        () =>
          this._runAllNodes(order, {
            concurrency,
            results,
            errors,
            fwd,
            continueOnError,
            requiredIds,
            seed,
            gracefulDegradation,
            requiredNodes,
            retryFailedNodes,
            maxRetries,
          }),
        timeout,
      );

      return this._processResults(results, errors, fwd, {
        gracefulDegradation,
        retryFailedNodes,
        enableCheckpoints,
        checkpointId,
      });
    } catch (error) {
      this._handleExecutionError(error);
    }
  }

  /**
   * Helper for running with optional global timeout
   * @param {Function} runFn - Function to run
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise} - Promise that resolves/rejects with timeout handling
   */
  async _runWithOptionalGlobalTimeout(runFn, timeout) {
    const run = Promise.resolve().then(runFn);
    if (!timeout || timeout <= 0) return run;
    return Promise.race([
      run,
      new Promise((_, reject) => {
        const t = setTimeout(
          () => reject(new Error('Execution timeout')),
          timeout,
        );
        run.finally(() => clearTimeout(t));
      }),
    ]);
  }

  /**
   * Build adjacency lists for the DAG
   * @returns {Object} - Object with fwd and rev adjacency maps
   */
  _buildAdjacency() {
    return buildAdjacency(this.nodes);
  }

  /**
   * Get sink node IDs (nodes with no outgoing edges)
   * @param {Map} fwd - Forward adjacency map
   * @returns {Array} - Array of sink node IDs
   */
  _getSinkIds(fwd) {
    return getSinkIds(fwd);
  }

  /**
   * Get required node IDs (all sinks + all their ancestors)
   * @param {Map} fwd - Forward adjacency map
   * @param {Map} rev - Reverse adjacency map
   * @returns {Set} - Set of required node IDs
   */
  _getRequiredIds(fwd, rev) {
    const sinkIds = this._getSinkIds(fwd);
    const required = new Set();
    const visited = new Set();

    const addAncestors = (nodeId) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      required.add(nodeId);

      const parents = rev.get(nodeId) || new Set();
      for (const parentId of parents) {
        addAncestors(parentId);
      }
    };

    for (const sinkId of sinkIds) {
      addAncestors(sinkId);
    }

    return required;
  }

  /**
   * Build adjacency list for the DAG (legacy method for compatibility)
   * @returns {Map} - Adjacency list mapping node IDs to arrays of dependent node IDs
   */
  buildAdjacencyList() {
    const { fwd } = this._buildAdjacency();
    const adjacency = new Map();

    for (const [nodeId, children] of fwd) {
      adjacency.set(nodeId, Array.from(children));
    }

    return adjacency;
  }

  /**
   * Validates the DAG structure
   * @returns {boolean} - True if valid
   * @throws {Error} - If validation fails
   */
  validate() {
    return validateDAG(this.nodes);
  }

  /**
   * Execute a single node with input data
   * @param {DAGNode} node - Node to execute
   * @param {Object} context - Execution context
   * @returns {Promise<any>} Node execution result
   */
  async executeNode(node, context) {
    return this.scheduler.executeNode(node, context);
  }

  /**
   * Validate topology with advanced options
   * @param {Object} _options - Validation options
   * @returns {Array} - Array of warnings (empty if no issues)
   */
  validateTopology(_options = {}) {
    return validateTopology(this.nodes, _options);
  }

  /**
   * Performs topological sort with cycle detection
   * @returns {DAGNode[]} Topologically sorted nodes
   * @throws {Error} If cycles are detected
   */
  topoSort() {
    return topologicalSort(this.nodes);
  }

  /**
   * Resume execution from checkpoint data
   * @param {Object} checkpointData - Checkpoint data to resume from
   * @returns {Promise<Map>} - Results Map from resumed execution
   */
  async resume(checkpointData = {}) {
    const { completed = [], results: priorResults = {} } = checkpointData;

    // Start with prior results as they were
    const results = new Map(Object.entries(priorResults));

    // Validate topology first
    this.validateTopology();

    // Get topological order and adjacency
    const order = this.topoSort();
    const { fwd } = this._buildAdjacency();

    // Execute remaining nodes
    for (const node of order) {
      if (completed.includes(node.id)) {
        continue; // Skip already completed nodes
      }

      try {
        // Handle undefined node.run function
        if (typeof node.run !== 'function') {
          throw new Error(`Node ${node.id} has no run function`);
        }

        // Prepare input based on dependencies
        let input;
        if (node.inputs.length === 0) {
          input = null; // No seed in resume
        } else if (node.inputs.length === 1) {
          input = results.get(node.inputs[0].id);
        } else {
          input = node.inputs.map((inputNode) => results.get(inputNode.id));
        }

        // Retry logic
        const maxRetries = Math.max(0, node?.retry?.retries ?? 0);
        const delayMs = Math.max(0, node?.retry?.delayMs ?? 0);
        let attempt = 0;
        let keepRetrying = true;

        while (keepRetrying) {
          try {
            // Execute the node
            const output = await node.run(input);
            results.set(node.id, output);
            keepRetrying = false;
          } catch (e) {
            attempt += 1;
            if (attempt <= maxRetries) {
              if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
              continue; // no error recorded yet
            }
            // FINAL failure path - warn EXACT string and keep going
            // eslint-disable-next-line no-console
            console.warn(`Node ${node.id} failed during resume: ${e.message}`);
            keepRetrying = false; // Don't throw, just continue
          }
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(`Node ${node.id} failed during resume: ${error.message}`);
        continue;
      }
    }

    return results;
  }

  /**
   * Save execution checkpoint
   * @param {string} checkpointId - Unique checkpoint identifier
   * @param {Object} state - Execution state to save
   */
  saveCheckpoint(checkpointId, state) {
    if (!this.checkpoints) {
      this.checkpoints = new Map();
    }
    this.checkpoints.set(checkpointId, {
      timestamp: Date.now(),
      results: new Map(state.results),
      errors: new Map(state.errors),
    });
  }

  /**
   * Load execution checkpoint
   * @param {string} checkpointId - Unique checkpoint identifier
   * @returns {Object|null} - Saved execution state or null if not found
   */
  loadCheckpoint(checkpointId) {
    if (!this.checkpoints) {
      return null;
    }
    return this.checkpoints.get(checkpointId) || null;
  }

  /**
   * List all available checkpoints
   * @returns {Array} - Array of checkpoint IDs with metadata
   */
  listCheckpoints() {
    if (!this.checkpoints) {
      return [];
    }
    return Array.from(this.checkpoints.entries()).map(([id, data]) => ({
      id,
      timestamp: data.timestamp,
      resultCount: data.results.size,
      errorCount: data.errors.size,
    }));
  }

  /**
   * Clear execution checkpoint
   * @param {string} checkpointId - Unique checkpoint identifier
   */
  clearCheckpoint(checkpointId) {
    if (this.checkpoints) {
      this.checkpoints.delete(checkpointId);
    }
  }

  /**
   * Get all downstream nodes that depend on the given node
   * @param {DAGNode} node - Node to find downstream dependencies for
   * @returns {DAGNode[]} Array of downstream nodes
   */
  getDownstreamNodes(node) {
    const downstream = new Set();
    const visited = new Set();

    const traverse = (currentNode) => {
      if (visited.has(currentNode.id)) return;
      visited.add(currentNode.id);

      for (const output of currentNode.outputs) {
        downstream.add(output);
        traverse(output);
      }
    };

    traverse(node);
    return Array.from(downstream);
  }
}

// Export classes
module.exports = { DAG, DAGNode };
module.exports.default = module.exports;
