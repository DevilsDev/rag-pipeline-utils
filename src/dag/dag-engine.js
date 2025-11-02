/**
 * Version: 2.0.2
 * Path: /src/dag/dag-engine.js
 * Description: DAG executor for chained RAG pipelines with cycle detection, error handling, and optional concurrency
 * Author: Ali Kahwaji
 */

const DAGNode = require('./dag-node.js');

class DAG {
  constructor() {
    this.nodes = new Map();
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
    const {
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
    } = context;

    const semaphore = concurrency ? new Array(concurrency).fill(null) : null;
    let semaphoreIndex = 0;

    const executeWithSemaphore = async (node) => {
      if (semaphore) {
        // Wait for available slot
        while (semaphore[semaphoreIndex % semaphore.length] !== null) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        const slotIndex = semaphoreIndex % semaphore.length;
        semaphoreIndex++;

        try {
          const result = await this.executeNode(node, {
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
          });
          // Only set result if it's not undefined (failed optional nodes return undefined)
          if (result !== undefined) {
            results.set(node.id, result);
          }
        } finally {
          semaphore[slotIndex] = null;
        }
      } else {
        const result = await this.executeNode(node, {
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
        });
        // Only set result if it's not the special failed-optional-node symbol
        if (
          typeof result !== 'symbol' ||
          result.description !== 'failed-optional-node'
        ) {
          results.set(node.id, result);
        }
      }
    };

    // Execute nodes respecting dependencies
    for (const node of order) {
      // Check if all dependencies are satisfied
      const canExecute = this._canExecuteNode(node, {
        results,
        errors,
        gracefulDegradation,
        requiredNodes,
      });

      if (canExecute) {
        await executeWithSemaphore(node);
      }
    }
  }

  /**
   * Check if a node can be executed based on dependency satisfaction
   * @param {DAGNode} node - Node to check
   * @param {Object} context - Execution context
   * @returns {boolean}
   */
  _canExecuteNode(node, context) {
    const { results, errors, gracefulDegradation, requiredNodes } = context;

    return node.inputs.every((dep) => {
      // If dependency has result or error, it's satisfied
      if (results.has(dep.id) || errors.has(dep.id)) {
        return true;
      }
      // If graceful degradation is enabled and dependency is not required, it's satisfied
      if (
        gracefulDegradation &&
        requiredNodes &&
        !requiredNodes.includes(dep.id)
      ) {
        return true;
      }
      return false;
    });
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
    // Error policy: wrap everything in try/catch
    // If caught error is a node error (message starts with "Node " OR error.nodeId) → rethrow unchanged
    if (error.message.startsWith('Node ') || error.nodeId) {
      throw error;
    }

    // If caught error is validation or aggregate → wrap once
    if (
      error.cycle ||
      /^DAG validation failed/.test(error.message) ||
      error.errors
    ) {
      const wrappedError = new Error(`DAG execution failed: ${error.message}`);
      if (error.cycle) wrappedError.cycle = error.cycle;
      if (error.errors) wrappedError.errors = error.errors;
      if (error.nodeId) wrappedError.nodeId = error.nodeId;
      if (error.timestamp) wrappedError.timestamp = error.timestamp;
      throw wrappedError;
    }

    // Do NOT wrap timeout errors or 'no sink nodes' errors
    if (
      error.message === 'Execution timeout' ||
      error.message === 'DAG has no sink nodes - no final output available'
    ) {
      throw error;
    }

    // Otherwise wrap with 'DAG execution failed: ...'
    const wrappedError = new Error(`DAG execution failed: ${error.message}`);
    if (error.errors) wrappedError.errors = error.errors;
    if (error.nodeId) wrappedError.nodeId = error.nodeId;
    if (error.timestamp) wrappedError.timestamp = error.timestamp;
    if (error.cycle) wrappedError.cycle = error.cycle;
    throw wrappedError;
  }

  /**
   * Execute function with optional timeout
   * @param {Function} runFn - Function to execute
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<void>}
   */
  async _executeWithTimeout(runFn, timeout) {
    if (timeout && timeout > 0) {
      await Promise.race([
        runFn(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Execution timeout')), timeout);
        }),
      ]);
    } else {
      await runFn();
    }
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
    if (errors.size >= 2) {
      const agg = new Error('Multiple execution errors');
      agg.errors = [...errors.values()].map((x) => x.cause || x);
      throw agg;
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
    const fwd = new Map(); // node -> Set of children
    const rev = new Map(); // node -> Set of parents

    // Initialize adjacency lists for all nodes
    for (const node of this.nodes.values()) {
      fwd.set(node.id, new Set());
      rev.set(node.id, new Set());
    }

    // Populate adjacency lists based on node connections
    for (const node of this.nodes.values()) {
      for (const output of node.outputs) {
        fwd.get(node.id).add(output.id);
        // Only add reverse edge if the output node exists in the DAG
        if (rev.has(output.id)) {
          rev.get(output.id).add(node.id);
        }
      }
    }

    return { fwd, rev };
  }

  /**
   * Get sink node IDs (nodes with no outgoing edges)
   * @param {Map} fwd - Forward adjacency map
   * @returns {Array} - Array of sink node IDs
   */
  _getSinkIds(fwd) {
    const sinkIds = [];
    for (const [nodeId, children] of fwd) {
      if (children.size === 0) {
        sinkIds.push(nodeId);
      }
    }
    return sinkIds;
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
    if (this.nodes.size === 0) {
      throw new Error('DAG is empty - no nodes to execute');
    }

    // Check for cycles using topological sort
    try {
      this.topoSort();
    } catch (error) {
      if (error.message.includes('Cycle detected')) {
        // Extract cycle information from error message or use error.cycle if available
        let nodes = error.cycle;
        if (!nodes && error.message.includes('involving node:')) {
          // Parse cycle from message if cycle array not available
          const match = error.message.match(/involving node: (.+)/);
          if (match) {
            nodes = match[1].split(' -> ');
          }
        }
        if (!nodes) {
          nodes = ['unknown'];
        }

        const pretty = nodes.join(' -> ');
        const err = new Error(
          `DAG validation failed: DAG topological sort failed: Cycle detected involving node: ${pretty}`,
        );
        err.cycle = nodes;
        throw err;
      }
      throw new Error(`DAG validation failed: ${error.message}`);
    }

    // Check for orphaned nodes (nodes with no path to any sink)
    const { fwd } = this._buildAdjacency();
    const sinkIds = this._getSinkIds(fwd);
    if (sinkIds.length === 0) {
      throw new Error('DAG has no sink nodes - no final output available');
    }

    return true;
  }

  /**
   * Execute a single node with input data
   * @param {DAGNode} node - Node to execute
   * @param {Object} context - Execution context
   * @returns {Promise<any>} Node execution result
   */
  async executeNode(node, context) {
    const {
      results,
      errors,
      fwd,
      continueOnError,
      requiredIds,
      seed,
      gracefulDegradation,
      requiredNodes,
    } = context;

    // Handle undefined node.run function
    if (typeof node.run !== 'function') {
      throw new Error(`Node ${node.id} has no run function`);
    }

    // Determine criticality - default is critical unless explicitly marked optional
    // OR if gracefulDegradation is enabled and node is not in requiredNodes
    // OR if there are multiple sink nodes (individual sink failures should be non-critical)
    const sinkIds = this._getSinkIds(fwd);
    const isMultipleSinks = sinkIds.length > 1;
    const isSinkNode = sinkIds.includes(node.id);

    const isNonCritical =
      node?.optional === true ||
      node?.isOptional === true ||
      node?.critical === false ||
      (gracefulDegradation &&
        requiredNodes &&
        !requiredNodes.includes(node.id)) ||
      (isMultipleSinks && isSinkNode); // Sink nodes are non-critical when there are multiple sinks

    // Prepare input based on dependencies
    let input;
    if (node.inputs.length === 0) {
      input = seed;
    } else if (node.inputs.length === 1) {
      input = results.get(node.inputs[0].id);
    } else {
      input = node.inputs.map((inputNode) => {
        // For graceful degradation, return undefined for failed optional dependencies
        if (
          !results.has(inputNode.id) &&
          gracefulDegradation &&
          requiredNodes &&
          !requiredNodes.includes(inputNode.id)
        ) {
          return undefined;
        }
        return results.get(inputNode.id);
      });
    }

    // Retry logic - use global options if available, otherwise node-specific
    const { retryFailedNodes, maxRetries: globalMaxRetries } = context;
    const nodeMaxRetries = retryFailedNodes
      ? Math.max(0, globalMaxRetries ?? 3)
      : Math.max(0, node?.retry?.retries ?? 0);
    const delayMs = Math.max(0, node?.retry?.delayMs ?? 0);
    let attempt = 0;
    let keepRetrying = true;

    while (keepRetrying) {
      try {
        // Execute the node
        const output = await node.run(input);
        if (errors.has(node.id)) errors.delete(node.id);
        return output;
      } catch (e) {
        attempt += 1;
        if (attempt <= nodeMaxRetries) {
          if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
          continue; // no error recorded yet
        }
        keepRetrying = false;
        // FINAL failure path
        const deps = [...(fwd.get(node.id) || [])];
        const suffix = deps.length
          ? `. This affects downstream nodes: ${deps.join(', ')}`
          : '';
        const nodeErr = new Error(
          `Node ${node.id} execution failed: ${e.message}${suffix}`,
        );
        nodeErr.nodeId = node.id;
        nodeErr.timestamp = Date.now();
        nodeErr.cause = e;

        // Handle non-critical failures with warnings and no result nullification
        if (isNonCritical || (continueOnError && !requiredIds.has(node.id))) {
          console.warn(`Non-critical node failure: ${nodeErr.message}`);
          errors.set(node.id, nodeErr);
          // Don't set result for failed optional nodes - return special symbol so they don't appear in results
          return Symbol('failed-optional-node');
        }
        errors.set(node.id, nodeErr);
        throw nodeErr;
      }
    }
  }

  /**
   * Validate topology with advanced options
   * @param {Object} _options - Validation options
   * @returns {Array} - Array of warnings (empty if no issues)
   */
  validateTopology(_options = {}) {
    const { strict = true } = _options;
    const warnings = [];

    // Check for empty DAG
    if (this.nodes.size === 0) {
      throw new Error('DAG cannot be empty');
    }

    // Check for self-loops
    for (const node of this.nodes.values()) {
      if (node.outputs.includes(node)) {
        throw new Error('Self-loop detected');
      }
    }

    // Check for cycles by attempting topological sort
    try {
      this.topoSort();
    } catch (error) {
      if (error.message.includes('Cycle detected')) {
        // Extract cycle information from error message or use error.cycle if available
        let nodes = error.cycle;
        if (!nodes && error.message.includes('involving node:')) {
          // Parse cycle from message if cycle array not available
          const match = error.message.match(/involving node: (.+)/);
          if (match) {
            nodes = match[1].split(' -> ');
          }
        }
        if (!nodes) {
          nodes = ['unknown'];
        }

        const err = new Error('Cycle detected in DAG');
        err.cycle = nodes;
        throw err;
      }
      throw error;
    }

    // Check for isolated nodes
    for (const node of this.nodes.values()) {
      if (node.inputs.length === 0 && node.outputs.length === 0) {
        const message = `Orphaned node detected: ${node.id}`;
        if (strict) {
          throw new Error(message);
        } else {
          warnings.push(message);
        }
      }
    }

    return warnings;
  }

  /**
   * Performs topological sort with cycle detection
   * @returns {DAGNode[]} Topologically sorted nodes
   * @throws {Error} If cycles are detected
   */
  topoSort() {
    const order = [];
    const visited = new Set();
    const visiting = new Set(); // Track nodes currently being visited

    const visit = (node, path = []) => {
      if (visiting.has(node.id)) {
        const cycleStart = path.indexOf(node.id);
        let cyclePath =
          cycleStart >= 0
            ? path.slice(cycleStart).concat([node.id])
            : [node.id];
        // Reverse interior to show forward traversal order (A->B->C->A)
        if (cyclePath.length > 2) {
          const startNode = cyclePath[0];
          const restNodes = cyclePath.slice(1, -1).reverse();
          cyclePath = [startNode, ...restNodes, startNode];
        }
        const cyclePathString = cyclePath.join(' -> ');
        const error = new Error(
          `Cycle detected involving node: ${cyclePathString}`,
        );
        error.cycle = cyclePath; // Array format for test assertions
        throw error;
      }

      if (visited.has(node.id)) return;

      visiting.add(node.id);
      const newPath = [...path, node.id];

      try {
        node.inputs.forEach((input) => visit(input, newPath));
      } catch (error) {
        if (error.message.includes('Cycle detected')) {
          throw error; // Preserve original message and cycle property
        }
        throw error;
      }

      visiting.delete(node.id);
      visited.add(node.id);
      order.push(node);
    };

    try {
      for (const node of this.nodes.values()) {
        visit(node);
      }
    } catch (error) {
      if (error.message.includes('Cycle detected')) {
        throw error;
      }
      throw new Error(`DAG topological sort failed: ${error.message}`);
    }

    return order;
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
