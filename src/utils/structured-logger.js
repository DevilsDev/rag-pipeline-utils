/**
 * @fileoverview Enterprise Structured Logger
 * Provides correlation ID tracking, structured JSON logging, and observability integration
 *
 * @author DevilsDev Team
 * @since 2.1.8
 */

const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

/**
 * Async local storage for correlation context
 */
const correlationContext = new AsyncLocalStorage();

/**
 * Log levels with numeric priorities
 */
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

/**
 * Enterprise structured logger with correlation tracking
 */
class StructuredLogger {
  constructor(options = {}) {
    this.serviceName = options.serviceName || 'rag-pipeline-utils';
    this.environment =
      options.environment || process.env.NODE_ENV || 'development';
    this.logLevel = options.logLevel || process.env.LOG_LEVEL || 'info';
    this.enableCorrelation = options.enableCorrelation !== false;
    this.enableMetrics = options.enableMetrics !== false;
    this.outputFormat = options.outputFormat || 'json'; // json, console

    // Performance tracking
    this.metrics = {
      logsWritten: 0,
      errorCount: 0,
      warnCount: 0,
      avgLatency: 0,
    };
  }

  /**
   * Create correlation context for request tracking
   * @param {string} correlationId - Optional correlation ID
   * @param {Function} fn - Function to execute with context
   * @returns {Promise} Result of function execution
   */
  async withCorrelation(correlationId, fn) {
    if (!this.enableCorrelation) {
      return fn();
    }

    const id = correlationId || this.generateCorrelationId();
    const context = {
      correlationId: id,
      startTime: Date.now(),
      requestId: crypto.randomUUID(),
    };

    return correlationContext.run(context, fn);
  }

  /**
   * Generate correlation ID
   * @returns {string} Correlation ID
   */
  generateCorrelationId() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Get current correlation context
   * @returns {object|null} Current context
   */
  getContext() {
    return correlationContext.getStore() || null;
  }

  /**
   * Create structured log entry
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {object} meta - Additional metadata
   * @returns {object} Structured log entry
   */
  createLogEntry(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const context = this.getContext();

    const baseEntry = {
      timestamp,
      level,
      message,
      service: this.serviceName,
      environment: this.environment,
      pid: process.pid,
      hostname: require('os').hostname(),
      ...meta,
    };

    // Add correlation data if available
    if (context && this.enableCorrelation) {
      baseEntry.correlationId = context.correlationId;
      baseEntry.requestId = context.requestId;

      if (context.startTime) {
        baseEntry.requestDuration = Date.now() - context.startTime;
      }
    }

    // Add stack trace for errors
    if (level === 'error' && meta.error) {
      if (meta.error instanceof Error) {
        baseEntry.error = {
          name: meta.error.name,
          message: meta.error.message,
          stack: meta.error.stack,
          code: meta.error.code,
        };
      }
    }

    return baseEntry;
  }

  /**
   * Check if log level should be written
   * @param {string} level - Log level to check
   * @returns {boolean} Whether to write log
   */
  shouldLog(level) {
    const currentLevelPriority = LOG_LEVELS[this.logLevel] || LOG_LEVELS.info;
    const messageLevelPriority = LOG_LEVELS[level] || LOG_LEVELS.info;
    return messageLevelPriority <= currentLevelPriority;
  }

  /**
   * Write log entry to output
   * @param {object} entry - Log entry
   */
  writeLog(entry) {
    const startTime = performance.now();

    try {
      if (this.outputFormat === 'json') {
        // Production JSON format
        console.log(JSON.stringify(entry));
      } else {
        // Development console format
        const { timestamp, level, message, correlationId, ...meta } = entry;
        const prefix = correlationId ? `[${correlationId.slice(0, 8)}]` : '';
        const metaStr =
          Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';

        console.log(
          `${timestamp} [${level.toUpperCase()}] ${prefix} ${message}${metaStr}`,
        );
      }

      // Update metrics
      if (this.enableMetrics) {
        this.metrics.logsWritten++;
        if (entry.level === 'error') this.metrics.errorCount++;
        if (entry.level === 'warn') this.metrics.warnCount++;

        const latency = performance.now() - startTime;
        this.metrics.avgLatency = (this.metrics.avgLatency + latency) / 2;
      }
    } catch (writeError) {
      // Fallback to console.error if structured logging fails
      console.error('Logger write failed:', writeError.message);
      console.error('Original message:', entry.message);
    }
  }

  /**
   * Log error message
   * @param {string} message - Error message
   * @param {object} meta - Additional metadata
   */
  error(message, meta = {}) {
    if (!this.shouldLog('error')) return;

    const entry = this.createLogEntry('error', message, meta);
    this.writeLog(entry);
  }

  /**
   * Log warning message
   * @param {string} message - Warning message
   * @param {object} meta - Additional metadata
   */
  warn(message, meta = {}) {
    if (!this.shouldLog('warn')) return;

    const entry = this.createLogEntry('warn', message, meta);
    this.writeLog(entry);
  }

  /**
   * Log info message
   * @param {string} message - Info message
   * @param {object} meta - Additional metadata
   */
  info(message, meta = {}) {
    if (!this.shouldLog('info')) return;

    const entry = this.createLogEntry('info', message, meta);
    this.writeLog(entry);
  }

  /**
   * Log debug message
   * @param {string} message - Debug message
   * @param {object} meta - Additional metadata
   */
  debug(message, meta = {}) {
    if (!this.shouldLog('debug')) return;

    const entry = this.createLogEntry('debug', message, meta);
    this.writeLog(entry);
  }

  /**
   * Log trace message
   * @param {string} message - Trace message
   * @param {object} meta - Additional metadata
   */
  trace(message, meta = {}) {
    if (!this.shouldLog('trace')) return;

    const entry = this.createLogEntry('trace', message, meta);
    this.writeLog(entry);
  }

  /**
   * Create child logger with additional context
   * @param {object} childMeta - Additional metadata for child logger
   * @returns {ChildLogger} Child logger instance
   */
  child(childMeta = {}) {
    return new ChildLogger(this, childMeta);
  }

  /**
   * Get logger metrics
   * @returns {object} Logger performance metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Reset logger metrics
   */
  resetMetrics() {
    this.metrics = {
      logsWritten: 0,
      errorCount: 0,
      warnCount: 0,
      avgLatency: 0,
    };
  }
}

/**
 * Child logger with additional context
 */
class ChildLogger {
  constructor(parent, childMeta) {
    this.parent = parent;
    this.childMeta = childMeta;
  }

  error(message, meta = {}) {
    this.parent.error(message, { ...this.childMeta, ...meta });
  }

  warn(message, meta = {}) {
    this.parent.warn(message, { ...this.childMeta, ...meta });
  }

  info(message, meta = {}) {
    this.parent.info(message, { ...this.childMeta, ...meta });
  }

  debug(message, meta = {}) {
    this.parent.debug(message, { ...this.childMeta, ...meta });
  }

  trace(message, meta = {}) {
    this.parent.trace(message, { ...this.childMeta, ...meta });
  }

  child(additionalMeta = {}) {
    return new ChildLogger(this.parent, {
      ...this.childMeta,
      ...additionalMeta,
    });
  }

  withCorrelation(correlationId, fn) {
    return this.parent.withCorrelation(correlationId, fn);
  }

  getContext() {
    return this.parent.getContext();
  }

  getMetrics() {
    return this.parent.getMetrics();
  }
}

/**
 * Create structured logger instance
 * @param {object} options - Logger configuration
 * @returns {StructuredLogger} Logger instance
 */
function createLogger(options = {}) {
  return new StructuredLogger(options);
}

// Default logger instance
const defaultLogger = createLogger({
  serviceName: 'rag-pipeline-utils',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  outputFormat: process.env.NODE_ENV === 'production' ? 'json' : 'console',
});

module.exports = {
  StructuredLogger,
  ChildLogger,
  createLogger,
  logger: defaultLogger,
  withCorrelation: defaultLogger.withCorrelation.bind(defaultLogger),
};

// CommonJS/ESM interop
module.exports.default = module.exports;
