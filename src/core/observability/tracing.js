/**
 * Distributed tracing support for RAG pipeline operations
 * Provides span-style lifecycle tracking with OpenTelemetry compatibility
 */

const { randomBytes  } = require('crypto');
const { eventLogger, EventTypes, EventSeverity  } = require('./event-logger.js');

/**
 * Span status codes (OpenTelemetry compatible)
 */
const SpanStatusCode = {
  UNSET: 0,
  OK: 1,
  ERROR: 2
};

/**
 * Span kinds (OpenTelemetry compatible)
 */
const SpanKind = {
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
class Span {
  constructor(name, traceIdOrOptions = {}, parentSpanId = undefined) {
    this.name = name;
    
    // Handle legacy parameter format: (name, traceId, parentSpanId)
    // vs new options format: (name, options)
    let options = {};
    if (typeof traceIdOrOptions === 'string') {
      // Legacy format: second parameter is traceId
      options.traceId = traceIdOrOptions;
      options.parentSpanId = parentSpanId;
    } else {
      // New format: second parameter is options object
      options = traceIdOrOptions || {};
    }
    
    this.traceId = options.traceId || generateTraceId();
    this.spanId = generateSpanId();
    this.parentSpanId = options.parentSpanId || undefined;
    this.kind = options.kind || SpanKind.INTERNAL;
    this.startTime = new Date();
    this.endTime = null;
    this.duration = null;
    this.status = { code: 'UNSET' };
    this.attributes = new Map();
    this.events = [];
    this.links = [];
    this.resource = options.resource || {};
    this.instrumentationLibrary = options.instrumentationLibrary || {
      name: 'rag-pipeline-utils',
      version: '2.1.8'
    };
    // Store reference to parent tracer for span lifecycle management
    this._tracer = options._tracer || null;
    
    // Create a proxy for bracket notation access to attributes
    const attributesProxy = new Proxy(this.attributes, {
      get(target, prop) {
        // Handle string properties as Map.get() for bracket notation
        if (typeof prop === 'string' && !target[prop]) {
          return target.get(prop);
        }
        // Delegate all other properties (including Map methods) to the target
        const value = target[prop];
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set(target, prop, value) {
        if (typeof prop === 'string') {
          target.set(prop, value);
          return true;
        }
        target[prop] = value;
        return true;
      }
    });
    
    // Override attributes with proxy for bracket notation access
    this.attributes = attributesProxy;
    
    // Set initial attributes if provided
    if (options.attributes && typeof options.attributes === 'object') {
      Object.entries(options.attributes).forEach(([key, value]) => {
        this.attributes.set(key, value);
      });
    }
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
  addEvent(name, attributes = {}, timestamp = new Date()) {
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
    const attributes = {
      'exception.type': exception.name,
      'exception.message': exception.message,
      'exception.stacktrace': exception.stack
    };
    
    // Include exception code if present
    if (exception.code) {
      attributes['exception.code'] = exception.code;
    }
    
    this.addEvent('exception', attributes);
    this.setStatus({
      code: 'ERROR',
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
  end(endTime = new Date()) {
    if (this.endTime !== null) {
      console.warn(`Span ${this.name} already ended`);
      return;
    }

    this.endTime = endTime;
    this.duration = Math.max(1, this.endTime.getTime() - this.startTime.getTime());

    // Set status to OK if not already set
    if (this.status.code === 'UNSET') {
      this.status.code = 'OK';
    }

    // Notify tracer to move span from active to completed (only if not already called by tracer)
    if (this._tracer && this._tracer.activeSpans.has(this.spanId)) {
      this._tracer.endSpan(this);
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

  /**
   * Check if span is finished
   * @returns {boolean} True if span is finished
   */
  isFinished() {
    return this.endTime !== null;
  }

  /**
   * Get span duration
   * @returns {number} Duration in milliseconds
   */
  getDuration() {
    if (this.endTime !== null) {
      return this.duration;
    }
    // Return current duration for active span
    return Date.now() - this.startTime.getTime();
  }

  /**
   * Serialize span to JSON
   * @returns {object} JSON representation of span
   */
  toJSON() {
    return {
      name: this.name,
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      kind: this.kind,
      startTime: this.startTime ? this.startTime.toISOString() : null,
      endTime: this.endTime ? this.endTime.toISOString() : null,
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
class Tracer {
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
    // Handle parent span option
    const spanOptions = { ...options };
    if (options.parent) {
      spanOptions.traceId = options.parent.traceId;
      spanOptions.parentSpanId = options.parent.spanId;
      delete spanOptions.parent; // Remove parent from options passed to Span constructor
    }
    
    const span = new Span(name, {
      ...spanOptions,
      resource: this.resource,
      instrumentationLibrary: {
        name: this.name,
        version: this.version
      },
      _tracer: this
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
      span.setStatus({ code: 'OK' });
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
    // Check if span is still in active spans (avoid double-ending)
    if (!this.activeSpans.has(span.spanId)) {
      return;
    }

    // Move span from active to completed first
    this.activeSpans.delete(span.spanId);
    
    // End the span (sets endTime and duration) - only if not already ended
    if (span.endTime === null) {
      span.end();
    }
    
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

    if (filters.namePattern) {
      spans = spans.filter(s => filters.namePattern.test(s.name));
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
    const totalSpans = activeSpans.length + completedSpans.length;
    
    const traceIds = new Set([
      ...activeSpans.map(s => s.traceId),
      ...completedSpans.map(s => s.traceId)
    ]);

    const statusCounts = {};
    completedSpans.forEach(span => {
      const status = span.status.code;
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    // Count spans by type
    const spansByType = {};
    const allSpans = [...activeSpans, ...completedSpans];
    allSpans.forEach(span => {
      // Extract type from span name (e.g., "embedder.openai" -> "embedder")
      const spanType = span.name.includes('.') ? span.name.split('.')[0] : 'plugin';
      spansByType[spanType] = (spansByType[spanType] || 0) + 1;
    });
    
    // If we have plugin-related spans, group them under 'plugin'
    if (Object.keys(spansByType).some(type => ['embedder', 'llm', 'retriever', 'loader', 'reranker'].includes(type))) {
      const pluginCount = Object.entries(spansByType)
        .filter(([type]) => ['embedder', 'llm', 'retriever', 'loader', 'reranker'].includes(type))
        .reduce((sum, [, count]) => sum + count, 0);
      if (pluginCount > 0) {
        spansByType.plugin = pluginCount;
      }
    }

    return {
      totalSpans,
      activeSpans: activeSpans.length,
      completedSpans: completedSpans.length,
      uniqueTraces: traceIds.size,
      statusCounts,
      spansByType,
      averageDuration: completedSpans.length > 0 
        ? completedSpans.reduce((sum, span) => sum + (span.duration || 0), 0) / completedSpans.length 
        : 0
    };
  }
}

/**
 * Pipeline tracer with plugin-specific instrumentation
 */
class PipelineTracer extends Tracer {
  constructor(options = {}) {
    super('rag-pipeline-tracer', '1.0.0', options);
  }

  /**
   * Trace plugin execution
   * @param {string} pluginType - Type of plugin
   * @param {string} pluginName - Name of plugin
   * @param {Function} fn - Plugin function to execute
   * @param {any} input - Plugin input
   * @param {object} context - Plugin execution context
   * @returns {Promise<any>} Plugin result
   */
  async tracePlugin(pluginType, pluginName, fn, input, context = {}) {
    return this.startActiveSpan(`plugin.${pluginType}.${pluginName}`, async (span) => {
      span.setAttributes({
        'plugin.type': pluginType,
        'plugin.name': pluginName,
        'plugin.input.size': this.getInputSize(input),
        'operation.type': 'plugin_execution'
      });

      // Add context attributes if provided
      if (context && typeof context === 'object') {
        Object.entries(context).forEach(([key, value]) => {
          span.setAttribute(`plugin.context.${key}`, value);
        });
      }

      const startTime = Date.now();
      
      try {
        const result = await fn(input);
        const duration = Date.now() - startTime;
        
        span.setAttributes({
          'plugin.duration': duration,
          'plugin.result.size': this.getResultSize(result),
          'plugin.status': 'success',
          'plugin.success': true
        });
        
        span.setStatus({ code: 'OK' });

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        span.setAttributes({
          'plugin.duration': duration,
          'plugin.status': 'error',
          'plugin.success': false,
          'plugin.error.type': error.name,
          'plugin.error.message': error.message
        });
        
        span.setStatus({ 
          code: 'ERROR', 
          message: error.message 
        });

        throw error;
      }
    });
  }

  /**
   * Trace pipeline stage
   * @param {string} stage - Stage name
   * @param {Function} fn - Stage function to execute
   * @param {object} context - Stage execution context
   * @param {object} metadata - Stage metadata
   * @returns {Promise<any>} Stage result
   */
  async traceStage(stage, fn, context = {}, metadata = {}) {
    return this.startActiveSpan(`pipeline.${stage}`, async (span) => {
      span.setAttributes({
        'pipeline.stage': stage,
        'operation.type': 'pipeline_stage',
        ...metadata
      });

      // Add context attributes if provided
      if (context && typeof context === 'object') {
        Object.entries(context).forEach(([key, value]) => {
          span.setAttribute(`stage.context.${key}`, value);
        });
      }

      try {
        const result = await fn();
        
        // Set success attributes
        span.setAttribute('stage.success', true);
        span.setStatus({ code: 'OK' });
        
        return result;
      } catch (error) {
        // Set failure attributes
        span.setAttribute('stage.success', false);
        span.setStatus({ 
          code: 'ERROR', 
          message: error.message 
        });
        
        // Record the exception
        span.recordException(error);
        
        throw error;
      }
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
const pipelineTracer = new PipelineTracer();

/**
 * OpenTelemetry-compatible trace API
 */
const trace = {
  getTracer: (name, version, options) => new Tracer(name, version, options),
  getActiveSpan: () => null, // Simplified for now
  setSpan: () => {}, // Simplified for now
  deleteSpan: () => {} // Simplified for now
};


// Default export



module.exports = {
  Span,
  Tracer,
  PipelineTracer,
  SpanStatusCode,
  SpanKind,
  pipelineTracer,
  trace
};