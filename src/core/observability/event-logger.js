/**
 * Structured event logging for RAG pipeline operations
 * Provides consistent metadata tracking across all plugin execution stages
 */

const { logger  } = require('../../utils/logger.js'); // eslint-disable-line global-require

/**
 * Event types for pipeline operations
 */
const EventTypes = {
  PLUGIN_START: 'plugin.start',
  PLUGIN_END: 'plugin.end',
  PLUGIN_ERROR: 'plugin.error',
  PIPELINE_START: 'pipeline.start',
  PIPELINE_END: 'pipeline.end',
  PIPELINE_ERROR: 'pipeline.error',
  STAGE_START: 'stage.start',
  STAGE_END: 'stage.end',
  STAGE_ERROR: 'stage.error',
  PERFORMANCE_METRIC: 'performance.metric',
  MEMORY_WARNING: 'memory.warning',
  BACKPRESSURE_APPLIED: 'backpressure.applied',
  BACKPRESSURE_RELIEVED: 'backpressure.relieved'
};

/**
 * Event severity levels
 */
const EventSeverity = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  CRITICAL: 'critical'
};

/**
 * Structured event logger for pipeline operations
 */
class PipelineEventLogger {
  constructor(_options = {}) {
    this.enabled = _options.enabled !== false;
    this.includeStackTrace = _options.includeStackTrace || false;
    this.maxEventHistory = _options.maxEventHistory || 1000;
    this.eventHistory = [];
    this.eventListeners = new Map();
    this.sessionId = this.generateSessionId();
  }

  /**
   * Generate unique session ID
   * @returns {string} Session ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log a structured event
   * @param {string} eventType - Type of event
   * @param {string} severity - Event severity level
   * @param {object} metadata - Event metadata
   * @param {string} message - Human-readable message
   */
  logEvent(eventType, severity, metadata = {}, message = '') {
    if (!this.enabled) return;

    const event = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      eventType,
      severity,
      message,
      metadata: {
        ...metadata,
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid
      }
    };

    // Add stack trace for errors if enabled
    if (severity === EventSeverity.ERROR && this.includeStackTrace) {
      event.stackTrace = new Error().stack;
    }

    // Add to event history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxEventHistory) {
      this.eventHistory.shift();
    }

    // Log using structured logger
    logger[severity](event.metadata, `[${eventType}] ${message}`);

    // Notify event listeners
    this.notifyListeners(event);
  }

  /**
   * Log plugin execution start
   * @param {string} pluginType - Type of plugin (loader, embedder, etc.)
   * @param {string} pluginName - Name of plugin
   * @param {object} input - Input parameters
   * @param {object} context - Execution context
   */
  logPluginStart(pluginType, pluginName, input = {}, context = {}) {
    this.logEvent(
      EventTypes.PLUGIN_START,
      EventSeverity.DEBUG,
      {
        pluginType,
        pluginName,
        inputSize: this.getInputSize(input),
        context,
        stage: 'start'
      },
      `Starting ${pluginType} plugin: ${pluginName}`
    );
  }

  /**
   * Log plugin execution end
   * @param {string} pluginType - Type of plugin
   * @param {string} pluginName - Name of plugin
   * @param {number} duration - Execution duration in ms
   * @param {object} result - Execution result metadata
   * @param {object} context - Execution context
   */
  logPluginEnd(pluginType, pluginName, duration, result = {}, context = {}) {
    this.logEvent(
      EventTypes.PLUGIN_END,
      EventSeverity.DEBUG,
      {
        pluginType,
        pluginName,
        duration,
        status: 'success',
        resultSize: this.getResultSize(result),
        context,
        stage: 'end'
      },
      `Completed ${pluginType} plugin: ${pluginName} (${duration}ms)`
    );
  }

  /**
   * Log plugin execution error
   * @param {string} pluginType - Type of plugin
   * @param {string} pluginName - Name of plugin
   * @param {Error} error - Error that occurred
   * @param {number} duration - Execution duration in ms
   * @param {object} context - Execution context
   */
  logPluginError(pluginType, pluginName, error, duration, context = {}) {
    this.logEvent(
      EventTypes.PLUGIN_ERROR,
      EventSeverity.ERROR,
      {
        pluginType,
        pluginName,
        duration,
        status: 'error',
        error: {
          name: error.name,
          message: error.message,
          code: error.code
        },
        context,
        stage: 'error'
      },
      `Failed ${pluginType} plugin: ${pluginName} - ${error.message}`
    );
  }

  /**
   * Log pipeline stage start
   * @param {string} stage - Stage name (ingest, query, etc.)
   * @param {object} metadata - Stage metadata
   */
  logStageStart(stage, metadata = {}) {
    this.logEvent(
      EventTypes.STAGE_START,
      EventSeverity.INFO,
      {
        stage,
        ...metadata
      },
      `Starting pipeline stage: ${stage}`
    );
  }

  /**
   * Log pipeline stage end
   * @param {string} stage - Stage name
   * @param {number} duration - Stage duration in ms
   * @param {object} metadata - Stage metadata
   */
  logStageEnd(stage, duration, metadata = {}) {
    this.logEvent(
      EventTypes.STAGE_END,
      EventSeverity.INFO,
      {
        stage,
        duration,
        status: 'success',
        ...metadata
      },
      `Completed pipeline stage: ${stage} (${duration}ms)`
    );
  }

  /**
   * Log performance metric
   * @param {string} metric - Metric name
   * @param {number} value - Metric value
   * @param {string} unit - Metric unit
   * @param {object} tags - Metric tags
   */
  logPerformanceMetric(metric, value, unit = '', tags = {}) {
    this.logEvent(
      EventTypes.PERFORMANCE_METRIC,
      EventSeverity.DEBUG,
      {
        metric,
        value,
        unit,
        tags
      },
      `Performance metric: ${metric} = ${value}${unit}`
    );
  }

  /**
   * Log memory warning
   * @param {object} memoryUsage - Current memory usage
   * @param {number} threshold - Warning threshold
   */
  logMemoryWarning(memoryUsage, threshold) {
    this.logEvent(
      EventTypes.MEMORY_WARNING,
      EventSeverity.WARN,
      {
        memoryUsage,
        threshold,
        usagePercentage: (memoryUsage.heapUsed / (threshold * 1024 * 1024)) * 100
      },
      `Memory usage warning: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`
    );
  }

  /**
   * Log backpressure events
   * @param {string} action - 'applied' or 'relieved'
   * @param {object} status - Backpressure status
   */
  logBackpressure(action, status) {
    const eventType = action === 'applied' ? EventTypes.BACKPRESSURE_APPLIED : EventTypes.BACKPRESSURE_RELIEVED;
    const severity = action === 'applied' ? EventSeverity.WARN : EventSeverity.INFO;
    
    this.logEvent(
      eventType,
      severity,
      {
        action,
        bufferSize: status.bufferSize,
        memoryUsage: status.memory,
        isPaused: status.isPaused
      },
      `Backpressure ${action}: Buffer=${status.bufferSize}, Memory=${status.memory?.usagePercentage}%`
    );
  }

  /**
   * Add event listener
   * @param {string} eventType - Event _type to listen for
   * @param {Function} callback - Callback function
   */
  addEventListener(eventType, callback) {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, []);
    }
    this.eventListeners.get(eventType).push(callback);
  }

  /**
   * Remove event listener
   * @param {string} eventType - Event _type
   * @param {Function} callback - Callback function to remove
   */
  removeEventListener(eventType, callback) {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Notify event listeners
   * @param {object} event - Event object
   */
  notifyListeners(event) {
    const listeners = this.eventListeners.get(event.eventType) || [];
    listeners.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Event listener error:', error); // eslint-disable-line no-console
      }
    });
  }

  /**
   * Get event history
   * @param {object} filters - Filters to apply
   * @returns {object[]} Filtered event history
   */
  getEventHistory(filters = {}) {
    let events = [...this.eventHistory];

    if (filters.eventType) {
      events = events.filter(e => e.eventType === filters.eventType);
    }

    if (filters.severity) {
      events = events.filter(e => e.severity === filters.severity);
    }

    if (filters.pluginType) {
      events = events.filter(e => e.metadata.pluginType === filters.pluginType);
    }

    if (filters.since) {
      const sinceTime = new Date(filters.since);
      events = events.filter(e => new Date(e.timestamp) >= sinceTime);
    }

    if (filters.limit) {
      events = events.slice(-filters.limit);
    }

    return events;
  }

  /**
   * Export events to JSON
   * @param {object} filters - Filters to apply
   * @returns {string} JSON string of events
   */
  exportEvents(filters = {}) {
    const events = this.getEventHistory(filters);
    return JSON.stringify({
      sessionId: this.sessionId,
      exportTime: new Date().toISOString(),
      eventCount: events.length,
      events
    }, null, 2);
  }

  /**
   * Clear event history
   */
  clearHistory() {
    this.eventHistory = [];
  }

  /**
   * Get input size for logging
   * @param {any} input - Input to measure
   * @returns {object} Size information
   */
  getInputSize(input) {
    if (Array.isArray(input)) {
      return { _type: 'array', length: input.length };
    } else if (typeof input === 'string') {
      return { _type: 'string', length: input.length };
    } else if (typeof input === 'object' && input !== null) {
      return { _type: 'object', keys: Object.keys(input).length };
    }
    return { _type: typeof input };
  }

  /**
   * Get result size for logging
   * @param {any} result - Result to measure
   * @returns {object} Size information
   */
  getResultSize(result) {
    return this.getInputSize(result);
  }

  /**
   * Get current session statistics
   * @returns {object} Session statistics
   */
  getSessionStats() {
    const events = this.eventHistory;
    const eventCounts = {};
    const severityCounts = {};
    const pluginCounts = {};

    events.forEach(event => {
      // Count by event type
      eventCounts[event.eventType] = (eventCounts[event.eventType] || 0) + 1;
      
      // Count by severity
      severityCounts[event.severity] = (severityCounts[event.severity] || 0) + 1;
      
      // Count by plugin type
      if (event.metadata.pluginType) {
        pluginCounts[event.metadata.pluginType] = (pluginCounts[event.metadata.pluginType] || 0) + 1;
      }
    });

    return {
      sessionId: this.sessionId,
      totalEvents: events.length,
      eventTypes: eventCounts,
      severityLevels: severityCounts,
      pluginTypes: pluginCounts,
      sessionStartTime: events[0]?.timestamp,
      lastEventTime: events[events.length - 1]?.timestamp
    };
  }
}

// Global event logger instance
const eventLogger = new PipelineEventLogger();


module.exports = {
  PipelineEventLogger,
  EventTypes,
  EventSeverity,
  eventLogger
};