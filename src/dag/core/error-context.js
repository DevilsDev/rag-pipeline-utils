/**
 * @fileoverview Error Context Management Module
 *
 * Provides centralized error handling, context management, and error reporting
 * for DAG execution. Handles error creation, aggregation, preservation of error
 * properties, and serialization for debugging and monitoring.
 *
 * @module dag/core/error-context
 * @author Ali Kahwaji
 * @since 2.2.4
 * @version 1.0.0
 */

'use strict';

/**
 * ErrorContext class for managing DAG execution errors
 *
 * Provides comprehensive error management with:
 * - Rich error context creation with node metadata
 * - Error aggregation for multiple failures
 * - Property preservation across error transformations
 * - Error serialization for logging and monitoring
 * - Cycle path tracking and reporting
 * - Downstream impact analysis
 *
 * @class
 * @since 2.2.4
 *
 * @example
 * const errorContext = new ErrorContext();
 *
 * // Create error with context
 * const nodeError = errorContext.createErrorContext('nodeA', new Error('Failed'), {
 *   downstream: ['nodeB', 'nodeC'],
 *   timestamp: Date.now()
 * });
 *
 * // Aggregate multiple errors
 * const errorsMap = new Map([['nodeA', error1], ['nodeB', error2]]);
 * const aggregated = errorContext.aggregateErrors(errorsMap);
 *
 * // Serialize for logging
 * console.log(errorContext.serializeError(nodeError));
 */
class ErrorContext {
  /**
   * Create an ErrorContext instance
   *
   * @constructor
   */
  constructor() {
    // Reserved for future state management if needed
  }

  /**
   * Create error context with node information and downstream impact
   *
   * Creates a new Error object enriched with:
   * - Node ID for tracing execution path
   * - Timestamp for temporal analysis
   * - Original error as cause (for stack trace preservation)
   * - Downstream node impact message
   *
   * @param {string} nodeId - ID of the node that failed
   * @param {Error} error - Original error that occurred
   * @param {Object} [options={}] - Additional context options
   * @param {string[]} [options.downstream=[]] - Array of downstream node IDs affected
   * @param {number} [options.timestamp=Date.now()] - Error timestamp
   * @returns {Error} Enhanced error object with context
   *
   * @example
   * const error = errorContext.createErrorContext(
   *   'processData',
   *   new Error('Invalid input'),
   *   {
   *     downstream: ['saveResults', 'sendNotification'],
   *     timestamp: Date.now()
   *   }
   * );
   * // Error message: "Node processData execution failed: Invalid input.
   * //                 This affects downstream nodes: saveResults, sendNotification"
   * // error.nodeId === 'processData'
   * // error.cause === original Error object
   *
   * @since 2.2.4
   */
  createErrorContext(nodeId, error, options = {}) {
    const { downstream = [], timestamp = Date.now() } = options;

    const suffix = downstream.length
      ? `. This affects downstream nodes: ${downstream.join(', ')}`
      : '';

    const nodeErr = new Error(
      `Node ${nodeId} execution failed: ${error.message}${suffix}`,
    );
    nodeErr.nodeId = nodeId;
    nodeErr.timestamp = timestamp;
    nodeErr.cause = error;

    return nodeErr;
  }

  /**
   * Aggregate multiple errors into a single error object
   *
   * Creates a consolidated error when multiple nodes fail during execution.
   * The aggregated error maintains references to all original errors for
   * comprehensive debugging.
   *
   * @param {Map<string, Error>} errorsMap - Map of node ID to error object
   * @returns {Error|null} Aggregated error, single error, or null if no errors
   *
   * @example
   * const errors = new Map([
   *   ['nodeA', new Error('A failed')],
   *   ['nodeB', new Error('B failed')]
   * ]);
   * const aggregated = errorContext.aggregateErrors(errors);
   * // aggregated.message === 'Multiple execution errors'
   * // aggregated.errors === [Error('A failed'), Error('B failed')]
   *
   * @since 2.2.4
   */
  aggregateErrors(errorsMap) {
    if (errorsMap.size >= 2) {
      const agg = new Error('Multiple execution errors');
      agg.errors = [...errorsMap.values()].map((x) => x.cause || x);
      return agg;
    }
    if (errorsMap.size === 1) {
      return [...errorsMap.values()][0];
    }
    return null;
  }

  /**
   * Preserve node context when wrapping or transforming errors
   *
   * Ensures all error metadata (nodeId, timestamp, cause, cycle, errors)
   * is preserved when creating wrapped errors. This is critical for
   * maintaining debugging information through error propagation.
   *
   * @param {Error} error - Original error to preserve
   * @param {Object} [context={}] - Additional context to add
   * @returns {Error} New error with preserved properties
   *
   * @example
   * const originalError = new Error('Original');
   * originalError.nodeId = 'nodeA';
   * originalError.timestamp = Date.now();
   *
   * const wrapped = errorContext.preserveNodeContext(originalError, {
   *   retryCount: 3
   * });
   * // wrapped.nodeId === 'nodeA'
   * // wrapped.timestamp === original timestamp
   * // wrapped.retryCount === 3
   *
   * @since 2.2.4
   */
  preserveNodeContext(error, context = {}) {
    const wrapped = new Error(error.message);

    // Preserve standard error properties
    if (error.nodeId !== undefined) wrapped.nodeId = error.nodeId;
    if (error.timestamp !== undefined) wrapped.timestamp = error.timestamp;
    if (error.cause !== undefined) wrapped.cause = error.cause;
    if (error.cycle !== undefined) wrapped.cycle = error.cycle;
    if (error.errors !== undefined) wrapped.errors = error.errors;

    // Add any additional context
    for (const [key, value] of Object.entries(context)) {
      if (!(key in wrapped)) {
        wrapped[key] = value;
      }
    }

    return wrapped;
  }

  /**
   * Format error report for debugging and monitoring
   *
   * Creates a structured representation of an error suitable for logging,
   * monitoring systems, or debugging tools. Includes all metadata and
   * nested error information.
   *
   * @param {Error} error - Error to format
   * @returns {Object} Structured error report
   *
   * @example
   * const report = errorContext.formatErrorReport(nodeError);
   * // {
   * //   message: "Node A execution failed: ...",
   * //   nodeId: "A",
   * //   timestamp: 1234567890,
   * //   cause: { message: "...", stack: "..." },
   * //   cycle: null,
   * //   errors: null
   * // }
   *
   * @since 2.2.4
   */
  formatErrorReport(error) {
    const report = {
      message: error.message,
      nodeId: error.nodeId || null,
      timestamp: error.timestamp || null,
      cause: error.cause
        ? {
            message: error.cause.message,
            stack: error.cause.stack,
          }
        : null,
      cycle: error.cycle || null,
      errors: error.errors
        ? error.errors.map((e) => ({
            message: e.message,
            stack: e.stack,
          }))
        : null,
    };

    return report;
  }

  /**
   * Serialize error for logging and monitoring systems
   *
   * Converts error to JSON string with formatting for readability.
   * Safe for logging systems that require string representation.
   *
   * @param {Error} error - Error to serialize
   * @param {number} [indent=2] - JSON indentation spaces
   * @returns {string} JSON string representation of error
   *
   * @example
   * const json = errorContext.serializeError(nodeError);
   * console.log(json);
   * // {
   * //   "message": "Node A execution failed: ...",
   * //   "nodeId": "A",
   * //   "timestamp": 1234567890,
   * //   ...
   * // }
   *
   * @since 2.2.4
   */
  serializeError(error, indent = 2) {
    return JSON.stringify(this.formatErrorReport(error), null, indent);
  }

  /**
   * Wrap execution errors with appropriate context
   *
   * Implements error wrapping policy:
   * - Node errors (with nodeId or starting with "Node ") are rethrown unchanged
   * - Validation/cycle errors are wrapped once with "DAG execution failed"
   * - Timeout and "no sink nodes" errors are not wrapped
   * - All other errors are wrapped with "DAG execution failed"
   *
   * All error properties are preserved during wrapping.
   *
   * @param {Error} error - Error to wrap
   * @returns {Error} Appropriately wrapped error
   *
   * @example
   * const nodeError = new Error('Node A failed');
   * nodeError.nodeId = 'A';
   * const wrapped = errorContext.wrapExecutionError(nodeError);
   * // Returns same error unchanged (node error policy)
   *
   * @example
   * const validationError = new Error('DAG validation failed: cycle detected');
   * validationError.cycle = ['A', 'B', 'A'];
   * const wrapped = errorContext.wrapExecutionError(validationError);
   * // Returns: Error('DAG execution failed: DAG validation failed: cycle detected')
   * // with cycle property preserved
   *
   * @since 2.2.4
   */
  wrapExecutionError(error) {
    // Node errors - rethrow unchanged
    if (error.message.startsWith('Node ') || error.nodeId) {
      return error;
    }

    // Validation or aggregate errors - wrap once
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
      return wrappedError;
    }

    // Timeout and "no sink nodes" errors - don't wrap
    if (
      error.message === 'Execution timeout' ||
      error.message === 'DAG has no sink nodes - no final output available'
    ) {
      return error;
    }

    // All other errors - wrap with context preservation
    const wrappedError = new Error(`DAG execution failed: ${error.message}`);
    if (error.errors) wrappedError.errors = error.errors;
    if (error.nodeId) wrappedError.nodeId = error.nodeId;
    if (error.timestamp) wrappedError.timestamp = error.timestamp;
    if (error.cycle) wrappedError.cycle = error.cycle;
    return wrappedError;
  }

  /**
   * Create cycle error with path information
   *
   * Creates a specialized error for cycle detection with the cycle path
   * embedded for debugging and error reporting.
   *
   * @param {string[]} cyclePath - Array of node IDs forming the cycle
   * @returns {Error} Cycle error with path information
   *
   * @example
   * const cycleError = errorContext.createCycleError(['A', 'B', 'C', 'A']);
   * // cycleError.message === 'Cycle detected involving node: A -> B -> C -> A'
   * // cycleError.cycle === ['A', 'B', 'C', 'A']
   *
   * @since 2.2.4
   */
  createCycleError(cyclePath) {
    const error = new Error(
      `Cycle detected involving node: ${cyclePath.join(' -> ')}`,
    );
    error.cycle = cyclePath;
    return error;
  }

  /**
   * Check if error should halt execution
   *
   * Determines if an error is critical enough to stop DAG execution
   * based on error type and execution options.
   *
   * @param {Error} error - Error to evaluate
   * @param {Object} options - Execution options
   * @param {boolean} [options.continueOnError=false] - Continue on non-critical errors
   * @param {boolean} [options.isNonCritical=false] - Whether node is non-critical
   * @returns {boolean} True if execution should halt
   *
   * @example
   * const shouldHalt = errorContext.shouldHaltExecution(error, {
   *   continueOnError: true,
   *   isNonCritical: true
   * });
   * // Returns false - execution continues
   *
   * @since 2.2.4
   */
  shouldHaltExecution(error, options = {}) {
    const { continueOnError = false, isNonCritical = false } = options;

    // Always halt on validation/cycle errors
    if (error.cycle || /^DAG validation failed/.test(error.message)) {
      return true;
    }

    // Halt on critical node errors
    if (error.nodeId && !isNonCritical && !continueOnError) {
      return true;
    }

    // Halt on timeout
    if (error.message === 'Execution timeout') {
      return true;
    }

    return false;
  }
}

module.exports = ErrorContext;

// Default export for convenience
module.exports.default = ErrorContext;
