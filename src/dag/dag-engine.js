/**
 * Version: 2.0.0
 * Path: /src/dag/dag-engine.js
 * Description: DAG executor for chained RAG pipelines with cycle detection and error handling
 * Author: Ali Kahwaji
 */

class DAGNode {
    constructor(id, run) {
      this.id = id;
      this.run = run; // async (input) => output
      this.inputs = [];
      this.outputs = [];
    }
    
    /**
     * Add an output connection to another node
     * @param {DAGNode} node - Target node to connect to
     */
    addOutput(node) {
      if (!node || typeof node !== 'object' || !node.inputs) {
        throw new Error('Invalid output node');
      }
      // Allow self-loops during construction - they will be detected during validation
      if (!this.outputs.includes(node)) {
        this.outputs.push(node);
      }
      if (!node.inputs.includes(this)) {
        node.inputs.push(this);
      }
      return this;
    }
    
    /**
     * Add an input connection from another node
     * @param {DAGNode} node - Source node to connect from
     */
    addInput(node) {
      if (!this.inputs.includes(node)) {
        this.inputs.push(node);
      }
      if (!node.outputs.includes(this)) {
        node.outputs.push(this);
      }
      return this;
    }
    
    /**
     * Remove an output connection
     * @param {DAGNode} node - Target node to disconnect from
     */
    removeOutput(node) {
      this.outputs = this.outputs.filter(n => n !== node);
      node.inputs = node.inputs.filter(n => n !== this);
      return this;
    }
    
    /**
     * Remove an input connection
     * @param {DAGNode} node - Source node to disconnect from
     */
    removeInput(node) {
      this.inputs = this.inputs.filter(n => n !== node);
      node.outputs = node.outputs.filter(n => n !== this);
      return this;
    }
  }
  
  class DAG {
    constructor() {
      this.nodes = new Map();
    }
  
    addNode(id, fn) {
      if (this.nodes.has(id)) {
        throw new Error(`Node with ID "${id}" already exists`);
      }
      const node = new DAGNode(id, fn);
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
     * Executes DAG from source nodes to sinks using topological order
     * @param {any} seedOrOptions - Initial input to the graph or execution options
     * @param {Object} options - Execution options (when seed is separate)
     * @returns {Promise<Map|any>} - Results Map or final output from sink(s)
     */
    async execute(seedOrOptions, options = {}) {
      // Handle different parameter patterns
      let seed, execOptions;
      if (typeof seedOrOptions === 'object' && seedOrOptions !== null && 
          (seedOrOptions.retryFailedNodes || seedOrOptions.gracefulDegradation || 
           seedOrOptions.maxRetries || seedOrOptions.requiredNodes || seedOrOptions.checkpointId)) {
        // First parameter is options object
        execOptions = seedOrOptions;
        seed = execOptions.seed || null;
      } else {
        // First parameter is seed
        seed = seedOrOptions;
        execOptions = options;
      }
      
      const {
        retryFailedNodes = false,
        maxRetries = 3,
        gracefulDegradation = false,
        requiredNodes = [],
        checkpointId = null,
        resumeFromCheckpoint = false,
        timeout = null,
        maxConcurrency = null,
        enableCheckpoints = false,
        externalCheckpointData = null
      } = execOptions;
      
      try {
        // Validate DAG before execution
        this.validate();
        
        // Initialize execution state
        const results = new Map();
        const errors = new Map();
        const retryCount = new Map();
        
        // Handle external checkpoint data if provided
        if (externalCheckpointData && externalCheckpointData instanceof Map) {
          // Use external checkpoint data as initial results
          for (const [nodeId, result] of externalCheckpointData) {
            results.set(nodeId, result);
          }
        }
        
        // Handle checkpoint resume
        if (resumeFromCheckpoint && checkpointId) {
          const checkpoint = this.loadCheckpoint(checkpointId);
          if (checkpoint) {
            for (const [nodeId, result] of checkpoint.results) {
              results.set(nodeId, result);
            }
          }
        }

        // Set up timeout if specified
        const startTime = Date.now();
        let timeoutId = null;
        const timeoutPromise = timeout ? new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error('Execution timeout'));
          }, timeout);
        }) : null;
        
        const checkTimeout = () => {
          if (timeout && (Date.now() - startTime) > timeout) {
            throw new Error('Execution timeout');
          }
        };
        
        // Get topological order for execution
        const order = this.topoSort();

        // Execute nodes with concurrency control if specified
        if (maxConcurrency && maxConcurrency > 1) {
          await this.executeConcurrent(order, {
            maxConcurrency,
            seed,
            results,
            errors,
            retryCount,
            retryFailedNodes,
            maxRetries,
            gracefulDegradation,
            requiredNodes,
            checkpointId,
            timeoutPromise,
            checkTimeout,
            enableCheckpoints
          });
        } else {
          // Sequential execution (original logic)
          for (const node of order) {
            // Check timeout before processing each node
            checkTimeout();
            
            // Skip if already completed (from checkpoint)
            if (results.has(node.id)) {
              continue;
            }
            
            await this.executeNode(node, {
              seed,
              results,
              errors,
              retryCount,
              retryFailedNodes,
              maxRetries,
              gracefulDegradation,
              requiredNodes,
              checkpointId,
              timeoutPromise,
              enableCheckpoints
            });
          }
        }

        // Clean up timeout if it was set
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        // Check for multiple errors and aggregate them
        if (errors.size > 1) {
          const errorList = Array.from(errors.entries()).map(([nodeId, errorMsg]) => {
            // Extract the original error message from the wrapped error
            const match = errorMsg.match(/Node .+ execution failed after \d+ attempts: (.+)/);
            const originalMessage = match ? match[1] : errorMsg;
            return {
              nodeId,
              message: originalMessage
            };
          });
          
          const aggregatedError = new Error('Multiple execution errors');
          aggregatedError.errors = errorList;
          throw aggregatedError;
        } else if (errors.size === 1 && !gracefulDegradation) {
          // Single error case - throw the original error
          const [nodeId, errorMsg] = Array.from(errors.entries())[0];
          throw new Error(errorMsg);
        }
        
        // Return results as Map for advanced features, or single result for simple cases
        if (retryFailedNodes || gracefulDegradation || checkpointId || requiredNodes.length > 0) {
          return results;
        }
        
        // Legacy behavior: return result from sink nodes
        const sinkNodes = order.filter(node => node.outputs.length === 0);
        if (sinkNodes.length === 0) {
          throw new Error('DAG has no sink nodes - no final output available');
        }
        
        if (sinkNodes.length === 1) {
          return results.get(sinkNodes[0].id);
        }
        
        // Multiple sinks - return all results
        return Object.fromEntries(
          sinkNodes.map(node => [node.id, results.get(node.id)])
        );
      } catch (error) {
        // Preserve all error properties (errors, nodeId, timestamp, etc.)
        const wrappedError = new Error(`DAG execution failed: ${error.message}`);
        
        // Copy all custom properties from original error
        if (error.errors) {
          wrappedError.errors = error.errors;
        }
        if (error.nodeId) {
          wrappedError.nodeId = error.nodeId;
        }
        if (error.timestamp) {
          wrappedError.timestamp = error.timestamp;
        }
        
        throw wrappedError;
      }
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
          let cyclePath = cycleStart >= 0 ? path.slice(cycleStart).concat([node.id]) : [node.id];
          // Reverse the path to show forward traversal order (A->B->C->A instead of A->C->B->A)
          if (cyclePath.length > 2) {
            const startNode = cyclePath[0];
            const restNodes = cyclePath.slice(1, -1).reverse();
            cyclePath = [startNode, ...restNodes, startNode];
          }
          const error = new Error('Cycle detected in DAG');
          error.cycle = cyclePath;
          throw error;
        }
        
        if (visited.has(node.id)) return;
        
        visiting.add(node.id);
        const newPath = [...path, node.id];
        
        try {
          node.inputs.forEach(input => visit(input, newPath));
        } catch (error) {
          // Propagate cycle detection errors
          if (error.message.includes('Cycle detected')) {
            throw error; // Re-throw without modification to preserve original message
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
        // Preserve cycle detection errors with their properties
        if (error.message.includes('Cycle detected')) {
          throw error; // Preserve original error with cycle property
        }
        throw new Error(`DAG topological sort failed: ${error.message}`);
      }
      
      return order;
    }

    /**
     * Validates the DAG structure
     * @throws {Error} If DAG is invalid
     */
    validate() {
      if (this.nodes.size === 0) {
        throw new Error('DAG is empty - no nodes to execute');
      }

      // Check for cycles by attempting topological sort
      try {
        this.topoSort();
      } catch (error) {
        throw new Error(`DAG validation failed: ${error.message}`);
      }

      // Check for orphaned nodes (nodes with no path to execution)
      const sourceNodes = Array.from(this.nodes.values()).filter(node => node.inputs.length === 0);
      if (sourceNodes.length === 0) {
        throw new Error('DAG has no source nodes - execution cannot begin');
      }

      return true;
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
        errors: new Map(state.errors)
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
     * Clear execution checkpoint
     * @param {string} checkpointId - Unique checkpoint identifier
     */
    clearCheckpoint(checkpointId) {
      if (this.checkpoints) {
        this.checkpoints.delete(checkpointId);
      }
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
        errorCount: data.errors.size
      }));
    }
    
    /**
     * Resume execution from checkpoint data
     * @param {Object} checkpointData - Checkpoint data to resume from
     * @param {any} seed - Optional seed data for resumed execution
     * @returns {Promise<Map>} - Results Map from resumed execution
     */
    async resume(checkpointData, seed = null) {
      // Validate topology first
      this.validateTopology();
      
      // Get topological order
      const order = this.topoSort();
      
      // Initialize results map
      const results = new Map();
      const errors = new Map();
      
      // Re-execute completed nodes to get their actual results
      // The checkpointData indicates which nodes completed successfully
      const completedNodeIds = checkpointData instanceof Map ? 
        Array.from(checkpointData.keys()) : 
        Object.keys(checkpointData || {});
      
      // Execute all nodes in topological order
      for (const node of order) {
        try {
          // Check if all dependencies are satisfied
          const dependencies = node.inputs.map(input => input.id);
          const unsatisfiedDeps = dependencies.filter(depId => !results.has(depId));
          
          if (unsatisfiedDeps.length > 0) {
            // Skip nodes with unsatisfied dependencies (likely failed nodes)
            continue;
          }
          
          // Prepare input from dependencies
          const input = dependencies.length > 0 ? 
            Object.fromEntries(dependencies.map(depId => [depId, results.get(depId)])) : 
            seed || {};
          
          // Execute the node
          const output = await node.run(input);
          results.set(node.id, output);
          
        } catch (error) {
          // Skip failed nodes if they weren't in the checkpoint
          if (!completedNodeIds.includes(node.id)) {
            console.warn(`Node ${node.id} failed during resume: ${error.message}`);
            continue;
          } else {
            // If a previously successful node now fails, that's an error
            throw error;
          }
        }
      }
      
      return results;
    }
    
    /**
     * Validate topology with advanced options
     * @param {Object} options - Validation options
     * @returns {Array} - Array of warnings (empty if no issues)
     */
    validateTopology(options = {}) {
      const { strict = true } = options;
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
        // Re-throw cycle detection errors directly to preserve cycle property
        if (error.message.includes('Cycle detected')) {
          throw error; // Preserve original error with cycle property
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
     * Execute a single node with retry and error handling
     * @param {DAGNode} node - Node to execute
     * @param {Object} options - Execution options
     */
    async executeNode(node, options) {
      const {
        seed,
        results,
        errors,
        retryCount,
        retryFailedNodes,
        maxRetries,
        gracefulDegradation,
        requiredNodes,
        checkpointId,
        timeoutPromise,
        enableCheckpoints
      } = options;
      
      let success = false;
      let lastError = null;
      const maxAttempts = retryFailedNodes ? maxRetries : 1;
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const inputValues = node.inputs.map(n => {
            const result = results.get(n.id);
            if (result === undefined && errors.has(n.id)) {
              if (gracefulDegradation && !requiredNodes.includes(n.id)) {
                return null; // Allow graceful degradation
              }
              throw new Error(`Input node ${n.id} failed: ${errors.get(n.id)}`);
            }
            return result;
          });
          
          const input = inputValues.length === 0 ? seed :
                       inputValues.length === 1 ? inputValues[0] : inputValues;
          
          // Execute node with timeout if specified
          const nodeExecution = node.run(input);
          let output;
          if (timeoutPromise) {
            // Use Promise.race to interrupt long-running operations
            output = await Promise.race([nodeExecution, timeoutPromise]);
          } else {
            output = await nodeExecution;
          }
          results.set(node.id, output);
          success = true;
          break;
        } catch (error) {
          lastError = error;
          // Preserve error context properties if they exist
          if (!error.nodeId) {
            error.nodeId = node.id;
          }
          if (!error.timestamp) {
            error.timestamp = Date.now();
          }
          retryCount.set(node.id, attempt);
          
          if (attempt < maxAttempts) {
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 100));
            continue;
          }
        }
      }
      
      if (!success) {
        const errorMsg = `Node ${node.id} execution failed after ${maxAttempts} attempts: ${lastError.message}`;
        errors.set(node.id, errorMsg);
        
        // For simple error propagation, only throw immediately if this is a single-node DAG
        // Otherwise, continue execution to collect multiple errors for aggregation
        if (!gracefulDegradation && !retryFailedNodes && requiredNodes.length === 0 && this.nodes.size === 1) {
          throw lastError; // Preserve original error object with context
        }
        
        // Check if this node is required or affects critical path
        const isRequired = requiredNodes.length === 0 || requiredNodes.includes(node.id);
        const dependentNodes = Array.from(this.nodes.values())
          .filter(n => n.inputs.some(input => input.id === node.id));
        
        if (isRequired && dependentNodes.length > 0 && !gracefulDegradation) {
          throw new Error(`${errorMsg}. This affects downstream nodes: ${dependentNodes.map(n => n.id).join(', ')}`);
        }
        
        // If graceful degradation is enabled, log but continue
        if (gracefulDegradation) {
          console.warn(`Non-critical node failure (graceful degradation): ${errorMsg}`);
        } else if (!isRequired) {
          console.warn(`Optional node failure: ${errorMsg}`);
        }
      }
      
      // Save checkpoint if specified
      if (checkpointId) {
        this.saveCheckpoint(checkpointId, { results: new Map(results), errors: new Map(errors) });
      }
    }
    
    /**
     * Execute nodes concurrently with dependency management
     * @param {DAGNode[]} order - Topologically sorted nodes
     * @param {Object} options - Execution options
     */
    async executeConcurrent(order, options) {
      const {
        maxConcurrency,
        seed,
        results,
        errors,
        retryCount,
        retryFailedNodes,
        maxRetries,
        gracefulDegradation,
        requiredNodes,
        checkpointId,
        timeoutPromise,
        checkTimeout,
        enableCheckpoints
      } = options;
      
      const pending = new Set();
      const completed = new Set();
      const nodeQueue = [...order];
      
      while (nodeQueue.length > 0 || pending.size > 0) {
        checkTimeout();
        
        // Start new nodes up to concurrency limit
        while (pending.size < maxConcurrency && nodeQueue.length > 0) {
          const node = nodeQueue.shift();
          
          // Skip if already completed (from checkpoint)
          if (results.has(node.id)) {
            completed.add(node.id);
            continue;
          }
          
          // Check if all dependencies are completed
          const dependenciesReady = node.inputs.every(input => 
            completed.has(input.id) || results.has(input.id)
          );
          
          if (dependenciesReady) {
            const nodePromise = this.executeNode(node, {
              seed,
              results,
              errors,
              retryCount,
              retryFailedNodes,
              maxRetries,
              gracefulDegradation,
              requiredNodes,
              checkpointId,
              timeoutPromise,
              enableCheckpoints
            }).then(() => {
              completed.add(node.id);
              pending.delete(nodePromise);
            }).catch(error => {
              completed.add(node.id);
              pending.delete(nodePromise);
              throw error;
            });
            
            pending.add(nodePromise);
          } else {
            // Put node back at end of queue if dependencies not ready
            nodeQueue.push(node);
          }
        }
        
        // Wait for at least one node to complete if we have pending work
        if (pending.size > 0) {
          await Promise.race(Array.from(pending));
        }
      }
    }
  }

// Export classes
module.exports = {
  DAGNode,
  DAG
};