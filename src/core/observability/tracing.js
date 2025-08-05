/**
 * Distributed tracing support for RAG pipeline operations
 * Provides span-style lifecycle tracking with OpenTelemetry compatibility
 */

import { randomBytes } from 'crypto';
import { eventLogger, EventTypes, EventSeverity } from './event-logger.js';

/**
 * Span status codes (OpenTelemetry compatible)
 */
export const SpanStatusCode = {
  UNSET: 0,
  OK: 1,
  ERROR: 2
};

/**
 * Span kinds (OpenTelemetry compatible)
 */
export const SpanKind = {
  INTERNAL: 0,
  SERVER: 1,
  CLIENT: 2,
  PRODUCER: 3,
  CONSUMER: 4
};

/**
 * Generate trace ID
 * @returns {string} 32-character hex trace ID
 */
function generateTraceId() {
  return randomBytes(16).toString('hex');
}

/**
 * Generate span ID
 * @returns {string} 16-character hex span ID
 */
function generateSpanId() {
  return randomBytes(8).toString('hex');
}

/**
 * Trace span implementation
 */
export class Span {
  constructor(name, options = {}) {
    this.name = name;
    this.traceId = options.traceId || generateTraceId();
    this.spanId = generateSpanId();
    this.parentSpanId = options.parentSpanId || null;
    this.kind = options.kind || SpanKind.INTERNAL;
    this.startTime = Date.now();
    this.endTime = null;
    this.duration = null;
    this.status = { code: SpanStatusCode.UNSET };
    this.attributes = new Map();
    this.events = [];
    this.links = [];
    this.resource = options.resource || {};
    this.instrumentationLibrary = options.instrumentationLibrary || {
      name: 'rag-pipeline-utils',
      version: '2.1.8'
    };
  }

  /**
   * Set span attribute
   * @param {string} key - Attribute key
   * @param {any} value - Attribute value
   */
  setAttribute(key, value) {
    this.attributes.set(key, value);
    return this;
  }

  /**
   * Set multiple span attributes
   * @param {object} attributes - Attributes object
   */
  setAttributes(attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      this.setAttribute(key, value);
    });
    return this;
  }

  /**
   * Set span status
   * @param {object} status - Status object with code and optional message
   */
  setStatus(status) {
    this.status = status;
    return this;
  }

  /**
   * Add event to span
   * @param {string} name - Event name
   * @param {object} attributes - Event attributes
   * @param {number} timestamp - Event timestamp (optional)
   */
  addEvent(name, attributes = {}, timestamp = Date.now()) {
    this.events.push({
      name,
      attributes,
      timestamp
    });
    return this;
  }

  /**
   * Record exception in span
   * @param {Error} exception - Exception to record
   */
  recordException(exception) {
    this.addEvent('exception', {
      'exception.type': exception.name,
      'exception.message': exception.message,
      'exception.stacktrace': exception.stack
    });
    this.setStatus({
      code: SpanStatusCode.ERROR,
      message: exception.message
    });
    return this;
  }

  /**
   * Add link to another span
   * @param {object} spanContext - Span context to link to
   * @param {object} attributes - Link attributes
   */
  addLink(spanContext, attributes = {}) {
    this.links.push({
      spanContext,
      attributes
    });
    return this;
  }

  /**
   * End the span
   * @param {number} endTime - End timestamp (optional)
   */
  end(endTime = Date.now()) {
    if (this.endTime !== null) {
      console.warn(`Span ${this.name} already ended`);
      return;
    }

    this.endTime = endTime;
    this.duration = this.endTime - this.startTime;

    // Set status to OK if not already set
    if (this.status.code === SpanStatusCode.UNSET) {
      this.status.code = SpanStatusCode.OK;
    }

    // Log span completion
    eventLogger.logEvent(
      EventTypes.STAGE_END,
      EventSeverity.DEBUG,
      {
        traceId: this.traceId,
        spanId: this.spanId,
        parentSpanId: this.parentSpanId,
        duration: this.duration,
        attributes: Object.fromEntries(this.attributes),
        status: this.status,
        eventCount: this.events.length
      },
      `Span completed: ${this.name} (${this.duration}ms)`
    );
  }

  /**
   * Get span context
   * @returns {object} Span context
   */
  getSpanContext() {
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      traceFlags: 1, // Sampled
      traceState: undefined
    };
  }

  /**
   * Check if span is recording
   * @returns {boolean} True if span is recording
   */
  isRecording() {
    return this.endTime === null;
  }

  /**
   * Export span data
   * @returns {object} Span export data
   */
  export() {
    return {
      name: this.name,
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      kind: this.kind,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.duration,
      status: this.status,
      attributes: Object.fromEntries(this.attributes),
      events: this.events,
      links: this.links,
      resource: this.resource,
      instrumentationLibrary: this.instrumentationLibrary
    };
  }
}

/**
 * Tracer implementation
 */
export class Tracer {
  constructor(name, version = '1.0.0', options = {}) {
    this.name = name;
    this.version = version;
    this.activeSpans = new Map();
    this.completedSpans = [];
    this.maxCompletedSpans = options.maxCompletedSpans || 1000;
    this.resource = options.resource || {
      'service.name': 'rag-pipeline-utils',
      'service.version': '2.1.8'
    };
  }

  /**
   * Start a new span
   * @param {string} name - Span name
   * @param {object} options - Span options
   * @returns {Span} New span
   */
  startSpan(name, options = {}) {
    const span = new Span(name, {
      ...options,
      resource: this.resource,
      instrumentationLibrary: {
        name: this.name,
        version: this.version
      }
    });

    this.activeSpans.set(span.spanId, span);

    // Log span start
    eventLogger.logEvent(
      EventTypes.STAGE_START,
      EventSeverity.DEBUG,
      {
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        spanName: name,
        attributes: Object.fromEntries(span.attributes)
      },
      `Span started: ${name}`
    );

    return span;
  }

  /**
   * Start an active span and execute callback
   * @param {string} name - Span name
   * @param {Function} fn - Function to execute within span
   * @param {object} options - Span options
   * @returns {Promise<any>} Result of callback function
   */
  async startActiveSpan(name, fn, options = {}) {
    const span = this.startSpan(name, options);
    
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      this.endSpan(span);
    }
  }

  /**
   * End a span
   * @param {Span} span - Span to end
   */
  endSpan(span) {
    if (!span.isRecording()) {
      return;
    }

    span.end();
    this.activeSpans.delete(span.spanId);
    
    // Add to completed spans
    this.completedSpans.push(span);
    if (this.completedSpans.length > this.maxCompletedSpans) {
      this.completedSpans.shift();
    }
  }

  /**
   * Get active span by ID
   * @param {string} spanId - Span ID
   * @returns {Span|null} Active span or null
   */
  getActiveSpan(spanId) {
    return this.activeSpans.get(spanId) || null;
  }

  /**
   * Get all active spans
   * @returns {Span[]} Array of active spans
   */
  getActiveSpans() {
    return Array.from(this.activeSpans.values());
  }

  /**
   * Get completed spans
   * @param {object} filters - Filters to apply
   * @returns {Span[]} Array of completed spans
   */
  getCompletedSpans(filters = {}) {
    let spans = [...this.completedSpans];

    if (filters.traceId) {
      spans = spans.filter(s => s.traceId === filters.traceId);
    }

    if (filters.name) {
      spans = spans.filter(s => s.name.includes(filters.name));
    }

    if (filters.status) {
      spans = spans.filter(s => s.status.code === filters.status);
    }

    if (filters.since) {
      const sinceTime = new Date(filters.since).getTime();
      spans = spans.filter(s => s.startTime >= sinceTime);
    }

    if (filters.limit) {
      spans = spans.slice(-filters.limit);
    }

    return spans;
  }

  /**
   * Export spans for external tracing systems
   * @param {object} filters - Filters to apply
   * @returns {object[]} Array of exported span data
   */
  exportSpans(filters = {}) {
    const spans = this.getCompletedSpans(filters);
    return spans.map(span => span.export());
  }

  /**
   * Clear completed spans
   */
  clearCompletedSpans() {
    this.completedSpans = [];
  }

  /**
   * Get trace statistics
   * @returns {object} Trace statistics
   */
  getTraceStats() {
    const activeSpans = this.getActiveSpans();
    const completedSpans = this.completedSpans;
    
    const traceIds = new Set([
      ...activeSpans.map(s => s.traceId),
      ...completedSpans.map(s => s.traceId)
    ]);

    const statusCounts = {};
    completedSpans.forEach(span => {
      const status = span.status.code;
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    return {
      activeSpans: activeSpans.length,
      completedSpans: completedSpans.length,
      uniqueTraces: traceIds.size,
      statusCounts,
      averageDuration: completedSpans.length > 0 
        ? completedSpans.reduce((sum, span) => sum + (span.duration || 0), 0) / completedSpans.length 
        : 0
    };
  }
}

/**
 * Pipeline tracer with plugin-specific instrumentation
 */
export class PipelineTracer extends Tracer {
  constructor(options = {}) {
    super('rag-pipeline-tracer', '1.0.0', options);
  }

  /**
   * Trace plugin execution
   * @param {string} pluginType - Type of plugin
   * @param {string} pluginName - Name of plugin
   * @param {Function} fn - Plugin function to execute
   * @param {any} input - Plugin input
   * @returns {Promise<any>} Plugin result
   */
  async tracePlugin(pluginType, pluginName, fn, input) {
    return this.startActiveSpan(`${pluginType}.${pluginName}`, async (span) => {
      span.setAttributes({
        'plugin.type': pluginType,
        'plugin.name': pluginName,
        'plugin.input.size': this.getInputSize(input),
        'operation.type': 'plugin_execution'
      });

      const startTime = Date.now();
      
      try {
        const result = await fn(input);
        const duration = Date.now() - startTime;
        
        span.setAttributes({
          'plugin.duration': duration,
          'plugin.result.size': this.getResultSize(result),
          'plugin.status': 'success'
        });

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        span.setAttributes({
          'plugin.duration': duration,
          'plugin.status': 'error',
          'plugin.error.type': error.name,
          'plugin.error.message': error.message
        });

        throw error;
      }
    });
  }

  /**
   * Trace pipeline stage
   * @param {string} stage - Stage name
   * @param {Function} fn - Stage function to execute
   * @param {object} metadata - Stage metadata
   * @returns {Promise<any>} Stage result
   */
  async traceStage(stage, fn, metadata = {}) {
    return this.startActiveSpan(`pipeline.${stage}`, async (span) => {
      span.setAttributes({
        'pipeline.stage': stage,
        'operation.type': 'pipeline_stage',
        ...metadata
      });

      return await fn();
    });
  }

  /**
   * Get input size for tracing
   * @param {any} input - Input to measure
   * @returns {number} Input size
   */
  getInputSize(input) {
    if (Array.isArray(input)) {
      return input.length;
    } else if (typeof input === 'string') {
      return input.length;
    } else if (typeof input === 'object' && input !== null) {
      return Object.keys(input).length;
    }
    return 1;
  }

  /**
   * Get result size for tracing
   * @param {any} result - Result to measure
   * @returns {number} Result size
   */
  getResultSize(result) {
    return this.getInputSize(result);
  }
}

// Global tracer instance
export const pipelineTracer = new PipelineTracer();

/**
 * OpenTelemetry-compatible trace API
 */
export const trace = {
  getTracer: (name, version, options) => new Tracer(name, version, options),
  getActiveSpan: () => null, // Simplified for now
  setSpan: () => {}, // Simplified for now
  deleteSpan: () => {} // Simplified for now
};
