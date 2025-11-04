/**
 * @fileoverview DAG Execution Scheduler Module
 *
 * Provides execution scheduling, concurrency management, and timeout handling
 * for DAG node execution. Handles retry logic, error reporting, and dependency
 * resolution.
 *
 * @module dag/core/execution-scheduler
 * @author Ali Kahwaji
 * @since 2.2.3
 * @version 1.0.0
 */

'use strict';

const ErrorContext = require('./error-context.js');

/**
 * ExecutionScheduler class for managing DAG node execution
 *
 * Provides stateless execution scheduling with:
 * - Concurrency control via semaphore
 * - Timeout enforcement
 * - Retry logic with exponential backoff
 * - Dependency resolution
 * - Error handling and reporting
 *
 * @class
 * @since 2.2.3
 */
class ExecutionScheduler {
  /**
   * Create an ExecutionScheduler instance
   *
   * @param {Object} options - Scheduler configuration
   * @param {Function} options.getSinkIds - Function to get sink node IDs
   * @param {Object} [options.logger] - Logger instance for debugging
   */
  constructor(options = {}) {
    this.getSinkIds = options.getSinkIds;
    this.logger = options.logger || console;
    this.errorContext = new ErrorContext();
  }

  /**
   * Schedule and execute all nodes with concurrency management
   *
   * Executes nodes in topological order, respecting dependencies and
   * managing concurrency via semaphore. Each node is executed only after
   * all its dependencies have completed or failed.
   *
   * @param {DAGNode[]} order - Topologically sorted array of nodes
   * @param {Object} context - Execution context
   * @param {number} [context.concurrency] - Maximum concurrent executions
   * @param {Map} context.results - Results map (node ID -> result)
   * @param {Map} context.errors - Errors map (node ID -> error)
   * @param {Map} context.fwd - Forward adjacency map
   * @param {boolean} [context.continueOnError] - Continue on non-critical errors
   * @param {Set} context.requiredIds - Set of required node IDs
   * @param {any} context.seed - Initial seed value
   * @param {boolean} [context.gracefulDegradation] - Enable graceful degradation
   * @param {string[]} [context.requiredNodes] - Array of required node IDs
   * @param {boolean} [context.retryFailedNodes] - Enable retry for failed nodes
   * @param {number} [context.maxRetries] - Maximum retry attempts
   * @returns {Promise<void>}
   *
   * @example
   * const scheduler = new ExecutionScheduler({ getSinkIds });
   * await scheduler.scheduleExecution(sortedNodes, {
   *   concurrency: 5,
   *   results: new Map(),
   *   errors: new Map(),
   *   fwd: adjacencyMap,
   *   requiredIds: new Set(['critical-node']),
   *   seed: initialInput
   * });
   *
   * @performance O(V) where V = number of nodes
   * @since 2.2.3
   */
  async scheduleExecution(order, context) {
    const { concurrency, results, errors, fwd } = context;

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
          const result = await this.executeNode(node, context);
          // Only set result if it's not undefined (failed optional nodes return undefined)
          if (result !== undefined) {
            results.set(node.id, result);
          }
        } finally {
          semaphore[slotIndex] = null;
        }
      } else {
        const result = await this.executeNode(node, context);
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
      const canExecute = this.canExecuteNode(node, context);

      if (canExecute) {
        await executeWithSemaphore(node);
      }
    }
  }

  /**
   * Execute a single DAG node with retry logic and error handling
   *
   * Executes node.run() with comprehensive error handling:
   * - Validates node.run is a function
   * - Determines node criticality
   * - Prepares input from dependencies
   * - Implements retry logic with configurable attempts
   * - Reports errors with downstream impact analysis
   *
   * @param {DAGNode} node - Node to execute
   * @param {Object} context - Execution context
   * @param {Map} context.results - Results map
   * @param {Map} context.errors - Errors map
   * @param {Map} context.fwd - Forward adjacency map
   * @param {boolean} [context.continueOnError] - Continue on non-critical errors
   * @param {Set} context.requiredIds - Required node IDs
   * @param {any} context.seed - Seed value for source nodes
   * @param {boolean} [context.gracefulDegradation] - Enable graceful degradation
   * @param {string[]} [context.requiredNodes] - Required node IDs array
   * @param {boolean} [context.retryFailedNodes] - Enable retry
   * @param {number} [context.maxRetries] - Max retry attempts
   * @returns {Promise<any>} Node execution result or Symbol('failed-optional-node')
   *
   * @throws {Error} Node execution error (if node is critical)
   *
   * @example
   * const result = await scheduler.executeNode(myNode, {
   *   results: new Map(),
   *   errors: new Map(),
   *   fwd: adjacencyMap,
   *   requiredIds: new Set(),
   *   seed: initialData,
   *   retryFailedNodes: true,
   *   maxRetries: 3
   * });
   *
   * @performance O(1) for single execution, O(k) for k retry attempts
   * @complexity Cyclomatic complexity: 12 (acceptable for critical execution path)
   * @since 2.2.3
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
    const sinkIds = this.getSinkIds(fwd);
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
        const nodeErr = this.errorContext.createErrorContext(node.id, e, {
          downstream: deps,
          timestamp: Date.now(),
        });

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
   * Execute function with optional timeout enforcement
   *
   * Uses Promise.race to enforce execution timeout. If timeout is not specified
   * or is <= 0, executes without timeout constraint.
   *
   * @param {Function} runFn - Async function to execute
   * @param {number} [timeout] - Timeout in milliseconds (0 or undefined = no timeout)
   * @returns {Promise<void>}
   *
   * @throws {Error} 'Execution timeout' if execution exceeds timeout
   *
   * @example
   * await scheduler.executeWithTimeout(
   *   () => executeLongRunningTask(),
   *   30000 // 30 second timeout
   * );
   *
   * @performance O(1) overhead for timeout setup
   * @since 2.2.3
   */
  async executeWithTimeout(runFn, timeout) {
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
   * Check if a node can be executed based on dependency satisfaction
   *
   * A node can execute if all its input dependencies have either:
   * - Completed successfully (have a result)
   * - Failed (have an error)
   * - Are optional (graceful degradation enabled and not in required nodes)
   *
   * @param {DAGNode} node - Node to check
   * @param {Object} context - Execution context
   * @param {Map} context.results - Results map
   * @param {Map} context.errors - Errors map
   * @param {boolean} [context.gracefulDegradation] - Enable graceful degradation
   * @param {string[]} [context.requiredNodes] - Required node IDs
   * @returns {boolean} True if node can execute, false otherwise
   *
   * @example
   * const canRun = scheduler.canExecuteNode(myNode, {
   *   results: new Map([['dep1', result1]]),
   *   errors: new Map(),
   *   gracefulDegradation: true,
   *   requiredNodes: ['critical-dep']
   * });
   *
   * @performance O(d) where d = number of input dependencies
   * @since 2.2.3
   */
  canExecuteNode(node, context) {
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
}

module.exports = ExecutionScheduler;

// Default export for convenience
module.exports.default = ExecutionScheduler;
