'use strict';

const { SecureLogger } = require('../utils/secure-logger');

const EventTypes = {
  PLUGIN_START: 'plugin.start',
  PLUGIN_END: 'plugin.end',
  PLUGIN_ERROR: 'plugin.error',
  STAGE_START: 'stage.start',
  STAGE_END: 'stage.end',
  PERFORMANCE_METRIC: 'performance.metric',
  MEMORY_WARNING: 'memory.warning',
  BACKPRESSURE_APPLIED: 'backpressure.applied',
  BACKPRESSURE_RELEASED: 'backpressure.released',
};

const EventSeverity = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
};

function nowISO() {
  return new Date().toISOString();
}
function randId() {
  return Math.random().toString(36).slice(2, 10);
}

class PipelineEventLogger {
  constructor(options = {}) {
    const {
      enabled = true,
      includeStackTrace = false,
      maxEventHistory = 1000,
      sessionId = `session_${Date.now()}_${randId()}`,
      secureLogging = true,
      secureLoggerOptions = {},
    } = options;
    this.enabled = !!enabled;
    this.includeStackTrace = !!includeStackTrace;
    this.maxEventHistory = maxEventHistory || 1000;
    this.sessionId = sessionId;
    this.eventHistory = [];
    this._listeners = new Map();

    // Initialize secure logger
    this.secureLoggingEnabled = !!secureLogging;
    this.secureLogger = new SecureLogger({
      enabled: this.secureLoggingEnabled,
      ...secureLoggerOptions,
    });
  }

  logEvent(eventType, severity, metadata = {}, message = '') {
    if (!this.enabled) return;

    // Redact sensitive data from metadata and message
    const safeMetadata = this.secureLoggingEnabled
      ? this.secureLogger.secureLog(metadata)
      : metadata;
    const safeMessage = this.secureLoggingEnabled
      ? this.secureLogger.secureLog(message)
      : message;

    const evt = {
      timestamp: nowISO(),
      sessionId: this.sessionId,
      eventType,
      severity,
      message: safeMessage,
      metadata: safeMetadata,
    };
    if (this.includeStackTrace && severity === EventSeverity.ERROR) {
      evt.stackTrace = new Error().stack;
    }
    this.eventHistory.push(evt);
    if (this.eventHistory.length > this.maxEventHistory) {
      this.eventHistory.splice(
        0,
        this.eventHistory.length - this.maxEventHistory,
      );
    }
    const listeners = this._listeners.get(eventType);
    if (listeners) {
      for (const fn of listeners) {
        try {
          fn(evt);
        } catch (e) {
          console.warn('Event listener error:', e);
        }
      }
    }
  }

  getInputSize(input) {
    return Array.isArray(input)
      ? { type: 'array', length: input.length }
      : typeof input === 'string'
        ? { type: 'string', length: input.length }
        : typeof input === 'object' && input !== null
          ? { type: 'object', keys: Object.keys(input).length }
          : { type: typeof input };
  }

  logPluginStart(pluginType, pluginName, input, context = {}) {
    const inputSize = this.getInputSize(input);
    this.logEvent(
      EventTypes.PLUGIN_START,
      EventSeverity.DEBUG,
      {
        pluginType,
        pluginName,
        inputSize,
        context,
        stage: 'start',
        pid: process.pid,
        platform: process.platform,
        nodeVersion: process.version,
      },
      `Starting ${pluginType} plugin: ${pluginName}`,
    );
  }

  logPluginEnd(
    pluginType,
    pluginName,
    duration,
    resultSize = {},
    context = {},
  ) {
    this.logEvent(
      EventTypes.PLUGIN_END,
      EventSeverity.DEBUG,
      {
        pluginType,
        pluginName,
        duration,
        resultSize,
        context,
        status: 'success',
        stage: 'end',
        pid: process.pid,
        platform: process.platform,
        nodeVersion: process.version,
      },
      `Completed ${pluginType} plugin: ${pluginName} (${duration}ms)`,
    );
  }

  logPluginError(pluginType, pluginName, error, duration, context = {}) {
    const safeError =
      error instanceof Error
        ? { name: error.name, message: error.message, code: error.code }
        : { name: 'Error', message: String(error) };
    this.logEvent(
      EventTypes.PLUGIN_ERROR,
      EventSeverity.ERROR,
      {
        pluginType,
        pluginName,
        duration,
        context,
        status: 'error',
        error: safeError,
        pid: process.pid,
        platform: process.platform,
        nodeVersion: process.version,
      },
      `Failed ${pluginType} plugin: ${pluginName} - ${safeError.message}`,
    );
  }

  logStageStart(stage, metadata = {}) {
    this.logEvent(
      EventTypes.STAGE_START,
      EventSeverity.INFO,
      {
        stage,
        ...metadata,
        pid: process.pid,
        platform: process.platform,
        nodeVersion: process.version,
      },
      `Starting pipeline stage: ${stage}`,
    );
  }

  logStageEnd(stage, duration, metadata = {}) {
    this.logEvent(
      EventTypes.STAGE_END,
      EventSeverity.INFO,
      {
        stage,
        duration,
        status: 'success', // Default status for completed stages
        ...metadata,
        pid: process.pid,
        platform: process.platform,
        nodeVersion: process.version,
      },
      `Completed pipeline stage: ${stage} (${duration}ms)`,
    );
  }

  logPerformanceMetric(name, value, unit = '', extra = {}) {
    this.logEvent(
      EventTypes.PERFORMANCE_METRIC,
      EventSeverity.DEBUG,
      {
        metric: name,
        value,
        unit,
        tags: extra, // Store extra as tags object
      },
      `Perf ${name}: ${value}${unit}`,
    );
  }

  logMemoryWarning(memoryUsage, thresholdMB) {
    const bytes = memoryUsage.heapUsed || 0;
    const thresholdBytes = thresholdMB * 1024 * 1024;
    const usagePercentage =
      thresholdBytes > 0 ? (bytes / thresholdBytes) * 100 : 0;
    this.logEvent(
      EventTypes.MEMORY_WARNING,
      EventSeverity.WARN,
      { memoryUsage, threshold: thresholdMB, usagePercentage },
      'Memory warning',
    );
  }

  logBackpressure(action, status = {}) {
    const eventType =
      action === 'released'
        ? EventTypes.BACKPRESSURE_RELEASED
        : EventTypes.BACKPRESSURE_APPLIED;
    this.logEvent(
      eventType,
      EventSeverity.WARN,
      { action, ...status },
      `Backpressure ${action}`,
    );
  }

  addEventListener(eventType, fn) {
    if (!this._listeners.has(eventType))
      this._listeners.set(eventType, new Set());
    this._listeners.get(eventType).add(fn);
  }
  removeEventListener(eventType, fn) {
    const s = this._listeners.get(eventType);
    if (s) s.delete(fn);
  }

  getEventHistory(filters = {}) {
    const { pluginType, eventType, severity, since, limit } = filters;
    let out = this.eventHistory.slice();
    if (eventType) out = out.filter((e) => e.eventType === eventType);
    if (severity) out = out.filter((e) => e.severity === severity);
    if (pluginType)
      out = out.filter(
        (e) => e.metadata && e.metadata.pluginType === pluginType,
      );
    if (since)
      out = out.filter((e) => new Date(e.timestamp) >= new Date(since));
    if (typeof limit === 'number') out = out.slice(-limit);
    return out;
  }

  clearHistory() {
    this.eventHistory = [];
  }

  exportEvents(filters = {}) {
    const events = this.getEventHistory(filters);
    return JSON.stringify({
      sessionId: this.sessionId,
      exportTime: nowISO(),
      eventCount: events.length,
      events,
    });
  }

  getSessionStats() {
    const total = this.eventHistory.length;
    const eventTypes = this.eventHistory.reduce((acc, e) => {
      acc[e.eventType] = (acc[e.eventType] || 0) + 1;
      return acc;
    }, {});

    const severityLevels = this.eventHistory.reduce((acc, e) => {
      acc[e.severity] = (acc[e.severity] || 0) + 1;
      return acc;
    }, {});

    const pluginTypes = this.eventHistory.reduce((acc, e) => {
      if (e.metadata && e.metadata.pluginType) {
        acc[e.metadata.pluginType] = (acc[e.metadata.pluginType] || 0) + 1;
      }
      return acc;
    }, {});

    const timestamps = this.eventHistory.map((e) => new Date(e.timestamp));
    const sessionStartTime = timestamps.length ? Math.min(...timestamps) : null;
    const lastEventTime = timestamps.length ? Math.max(...timestamps) : null;

    return {
      sessionId: this.sessionId,
      totalEvents: total,
      byType: eventTypes, // Keep for backward compatibility
      eventTypes,
      severityLevels,
      pluginTypes,
      sessionStartTime,
      lastEventTime,
    };
  }

  /**
   * Get redaction statistics from secure logger
   *
   * @returns {Object} Redaction statistics
   * @since 2.2.5
   */
  getRedactionStats() {
    return this.secureLogger.getStats();
  }

  /**
   * Reset redaction statistics
   *
   * @since 2.2.5
   */
  resetRedactionStats() {
    this.secureLogger.resetStats();
  }

  /**
   * Get secure logger instance for direct access
   *
   * @returns {SecureLogger} The secure logger instance
   * @since 2.2.5
   */
  getSecureLogger() {
    return this.secureLogger;
  }

  /**
   * Enable or disable secure logging
   *
   * @param {boolean} enabled - Enable state
   * @since 2.2.5
   */
  setSecureLogging(enabled) {
    this.secureLoggingEnabled = !!enabled;
    this.secureLogger.setEnabled(enabled);
  }
}

const eventLogger = new PipelineEventLogger();
if (!global.eventLogger) global.eventLogger = eventLogger;

module.exports = {
  PipelineEventLogger,
  EventTypes,
  EventSeverity,
  eventLogger,
};
