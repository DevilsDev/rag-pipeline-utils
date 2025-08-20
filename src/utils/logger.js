/**
 * Version: 0.2.0
 * Path: /src/utils/logger.js
 * Description: Centralized structured logger with correlation IDs and enterprise features
 * Author: Ali Kahwaji
 */

const pino = require('pino'); // eslint-disable-line global-require
const crypto = require('crypto'); // eslint-disable-line global-require

/**
 * Create a structured JSON logger instance with correlation IDs and enterprise features.
 * Supports distributed tracing, tenant isolation, and security audit logging.
 */
const baseLogger = pino({
  name: 'rag-pipeline-utils',
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label };
    }
  },
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  } : undefined
});

/**
 * Enhanced logger with correlation ID support and structured context
 */
class StructuredLogger {
  constructor(baseLogger) {
    this.logger = baseLogger;
    this.correlationId = null;
    this.context = {};
  }

  /**
   * Create a child logger with correlation ID and context
   */
  child(context = {}) {
    const correlationId = context.correlationId || crypto.randomUUID();
    const childLogger = new StructuredLogger(this.logger.child({
      correlationId,
      ...context
    }));
    childLogger.correlationId = correlationId;
    childLogger.context = { ...this.context, ...context };
    return childLogger;
  }

  /**
   * Set correlation ID for distributed tracing
   */
  setCorrelationId(correlationId) {
    this.correlationId = correlationId;
    return this;
  }

  /**
   * Add persistent context to all log messages
   */
  setContext(context) {
    this.context = { ...this.context, ...context };
    return this;
  }

  /**
   * Log with automatic correlation ID and context injection
   */
  _log(level, message, meta = {}) {
    const logData = {
      ...this.context,
      correlationId: this.correlationId || crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...meta
    };

    this.logger[level](logData, message);
  }

  info(message, meta) {
    this._log('info', message, meta);
  }

  error(message, meta) {
    this._log('error', message, meta);
  }

  warn(message, meta) {
    this._log('warn', message, meta);
  }

  debug(message, meta) {
    this._log('debug', message, meta);
  }

  /**
   * Security audit logging with enhanced metadata
   */
  audit(action, meta = {}) {
    this._log('info', `AUDIT: ${action}`, {
      ...meta,
      audit: true,
      action,
      severity: meta.severity || 'medium'
    });
  }

  /**
   * Performance logging with timing information
   */
  performance(operation, duration, meta = {}) {
    this._log('info', `PERFORMANCE: ${operation}`, {
      ...meta,
      performance: true,
      operation,
      duration,
      unit: 'ms'
    });
  }

  /**
   * Tenant-specific logging for multi-tenant applications
   */
  tenant(tenantId, message, meta = {}) {
    this._log('info', message, {
      ...meta,
      tenantId,
      tenant: true
    });
  }
}

// Create default logger instance
const logger = new StructuredLogger(baseLogger);

/**
 * Create a logger with correlation ID for request tracing
 */
function createLogger(correlationId, context = {}) {
  return logger.child({ correlationId, ...context });
}

/**
 * Middleware function for Express.js to add correlation IDs to requests
 */
function correlationMiddleware(req, res, next) {
  const correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
  req.correlationId = correlationId;
  req.logger = createLogger(correlationId, { 
    method: req.method, 
    url: req.url,
    userAgent: req.headers['user-agent']
  });
  
  res.setHeader('x-correlation-id', correlationId);
  next();
}

module.exports = {
  logger,
  createLogger,
  correlationMiddleware,
  StructuredLogger
};