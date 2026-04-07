'use strict';

/**
 * Execution Tracer
 *
 * Hooks into pipeline steps to capture full execution traces.
 * Records timing, inputs, outputs, and metadata for each pipeline run.
 */

const { EventEmitter } = require('events');
const { randomBytes } = require('crypto');

/**
 * Default tracer configuration
 */
const DEFAULT_CONFIG = {
  captureInputs: true,
  captureOutputs: true,
  maxPayloadSize: 10000,
};

/**
 * Generate a unique trace ID
 * @returns {string} 16-character hex trace ID
 */
function generateTraceId() {
  return randomBytes(8).toString('hex');
}

/**
 * Truncate a value if its JSON representation exceeds maxSize bytes
 * @param {*} value - Value to truncate
 * @param {number} maxSize - Maximum serialized size in characters
 * @returns {*} Original value or truncated string
 */
function truncatePayload(value, maxSize) {
  if (value === undefined || value === null) {
    return value;
  }
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
  if (serialized.length <= maxSize) {
    return value;
  }
  return serialized.slice(0, maxSize) + '...[truncated]';
}

/**
 * Execution tracer that wraps pipelines to capture run traces
 * @extends EventEmitter
 */
class ExecutionTracer extends EventEmitter {
  /**
   * Create a new ExecutionTracer
   * @param {object} [options] - Tracer configuration
   * @param {boolean} [options.captureInputs=true] - Whether to capture step inputs
   * @param {boolean} [options.captureOutputs=true] - Whether to capture step outputs
   * @param {number} [options.maxPayloadSize=10000] - Max characters before payload truncation
   */
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.traces = [];
  }

  /**
   * Wrap a pipeline to record execution traces on each run
   * @param {object} pipeline - Pipeline instance with a .run() method
   * @returns {object} Wrapped pipeline with instrumented .run()
   */
  trace(pipeline) {
    const tracer = this;
    const originalRun = pipeline.run.bind(pipeline);

    const wrapped = Object.create(pipeline);

    /**
     * Instrumented run that records a full execution trace
     * @param {object} params - Pipeline run parameters
     * @returns {Promise<object>} Pipeline result with attached trace
     */
    wrapped.run = async function tracedRun(params) {
      const traceRecord = {
        id: generateTraceId(),
        startTime: Date.now(),
        steps: [],
        metadata: {},
      };

      // Capture input
      if (tracer.config.captureInputs) {
        traceRecord.input = truncatePayload(
          params,
          tracer.config.maxPayloadSize,
        );
      }

      // Record the retrieval step (wraps the full pipeline.run call)
      const stepRecord = {
        step: 'pipeline.run',
        startTime: Date.now(),
      };

      let result;
      let error;
      try {
        result = await originalRun(params);
        stepRecord.success = true;
      } catch (err) {
        error = err;
        stepRecord.success = false;
        stepRecord.error = err.message;
      }

      stepRecord.endTime = Date.now();
      stepRecord.durationMs = stepRecord.endTime - stepRecord.startTime;

      if (tracer.config.captureOutputs && result) {
        stepRecord.output = truncatePayload(
          result,
          tracer.config.maxPayloadSize,
        );
      }

      traceRecord.steps.push(stepRecord);

      // Extract quality sub-steps from the result when available
      if (result) {
        if (result.results) {
          traceRecord.metadata.resultCount = result.results.length;
        }
        if (result.citations) {
          traceRecord.metadata.hasCitations = true;
          traceRecord.metadata.citations = result.citations;
        }
        if (result.evaluation) {
          traceRecord.metadata.hasEvaluation = true;
          traceRecord.metadata.evaluation = result.evaluation;
        }
      }

      // Capture output
      if (tracer.config.captureOutputs && result) {
        traceRecord.output = truncatePayload(
          result,
          tracer.config.maxPayloadSize,
        );
      }

      // Finalize
      traceRecord.endTime = Date.now();
      traceRecord.totalDurationMs = traceRecord.endTime - traceRecord.startTime;

      tracer.traces.push(traceRecord);
      tracer.emit('traced', traceRecord);

      if (error) {
        throw error;
      }

      // Attach trace to result
      result.trace = traceRecord;
      return result;
    };

    return wrapped;
  }

  /**
   * Return all recorded traces
   * @returns {Array<object>} Array of trace records
   */
  getTraces() {
    return this.traces;
  }

  /**
   * Return a specific trace by ID
   * @param {string} traceId - The trace ID to look up
   * @returns {object|undefined} The trace record, or undefined if not found
   */
  getTrace(traceId) {
    return this.traces.find((t) => t.id === traceId);
  }

  /**
   * Clear all recorded traces
   */
  clear() {
    this.traces = [];
  }

  /**
   * Export traces as a serialized string
   * @param {string} [format='json'] - Export format (currently only 'json')
   * @returns {string} Serialized traces
   */
  exportTraces(format = 'json') {
    if (format === 'json') {
      return JSON.stringify(this.traces, null, 2);
    }
    throw new Error(`Unsupported export format: ${format}`);
  }
}

module.exports = { ExecutionTracer, DEFAULT_CONFIG };
