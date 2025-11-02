/**
 * @fileoverview Structured audit logging system for security compliance and governance.
 * Provides immutable audit trails, compliance reporting, and regulatory compliance features.
 *
 * @author DevilsDev Team
 * @since 2.1.0
 * @version 2.1.0
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const { EventEmitter } = require('events');
const logger = require('../utils/structured-logger');
const { getTelemetryService } = require('./telemetry');

/**
 * Audit context for tracking compliance events across async operations.
 */
const auditContext = new AsyncLocalStorage();

/**
 * Structured audit logging service for compliance and security governance.
 *
 * Features:
 * - Immutable audit trail generation
 * - Compliance framework support (SOX, GDPR, HIPAA, PCI-DSS)
 * - Digital signatures for tamper detection
 * - Structured event categorization
 * - Real-time compliance monitoring
 * - Automated compliance reporting
 *
 * @class AuditLogger
 * @extends EventEmitter
 */
class AuditLogger extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      // Core Configuration
      enabled: options.enabled !== false,
      serviceName: options.serviceName || '@devilsdev/rag-pipeline-utils',
      instanceId: options.instanceId || crypto.randomUUID(),

      // Storage Configuration
      storage: {
        type: options.storage?.type || 'file', // file, database, s3
        location: options.storage?.location || './audit-logs',
        maxFileSize: options.storage?.maxFileSize || 100 * 1024 * 1024, // 100MB
        compression: options.storage?.compression !== false,
        encryption: options.storage?.encryption !== false,
        backup: options.storage?.backup !== false,
        ...options.storage,
      },

      // Compliance Configuration
      compliance: {
        frameworks: options.compliance?.frameworks || ['GDPR', 'SOX'], // GDPR, SOX, HIPAA, PCI-DSS
        retentionPeriod:
          options.compliance?.retentionPeriod || 7 * 365 * 24 * 60 * 60 * 1000, // 7 years
        immutableStorage: options.compliance?.immutableStorage !== false,
        digitalSignatures: options.compliance?.digitalSignatures !== false,
        realTimeMonitoring: options.compliance?.realTimeMonitoring !== false,
        ...options.compliance,
      },

      // Security Configuration
      security: {
        signatureAlgorithm:
          options.security?.signatureAlgorithm || 'RSA-SHA256',
        encryptionAlgorithm:
          options.security?.encryptionAlgorithm || 'aes-256-gcm',
        keyRotationInterval:
          options.security?.keyRotationInterval || 90 * 24 * 60 * 60 * 1000, // 90 days
        integrityChecks: options.security?.integrityChecks !== false,
        ...options.security,
      },

      // Event Configuration
      events: {
        categories: options.events?.categories || [
          'authentication',
          'authorization',
          'data_access',
          'data_modification',
          'system_access',
          'configuration_change',
          'security_event',
          'compliance_event',
        ],
        requiredFields: options.events?.requiredFields || [
          'timestamp',
          'eventType',
          'userId',
          'resource',
          'action',
          'outcome',
        ],
        sensitiveFields: options.events?.sensitiveFields || [
          'password',
          'token',
          'apiKey',
          'ssn',
          'creditCard',
        ],
        ...options.events,
      },

      // Monitoring Configuration
      monitoring: {
        alertOnFailures: options.monitoring?.alertOnFailures !== false,
        healthCheckInterval: options.monitoring?.healthCheckInterval || 60000, // 1 minute
        integrityCheckInterval:
          options.monitoring?.integrityCheckInterval || 3600000, // 1 hour
        complianceCheckInterval:
          options.monitoring?.complianceCheckInterval || 86400000, // 24 hours
        ...options.monitoring,
      },

      ...options,
    };

    // Internal state
    this.isInitialized = false;
    this.currentLogFile = null;
    this.auditChain = [];
    this.signingKey = null;
    this.encryptionKey = null;
    this.eventCounter = 0;
    this.lastIntegrityCheck = null;

    // Compliance trackers
    this.complianceEvents = new Map();
    this.retentionTracker = new Map();
    this.violationTracker = new Map();

    // Telemetry service
    this.telemetry = getTelemetryService();
  }

  /**
   * Initialize the audit logging service.
   *
   * @returns {Promise<void>} Initialization promise
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('Audit logger already initialized');
      return;
    }

    if (!this.config.enabled) {
      logger.info('Audit logging is disabled');
      return;
    }

    try {
      logger.info('Initializing audit logging service', {
        serviceName: this.config.serviceName,
        instanceId: this.config.instanceId,
        compliance: this.config.compliance.frameworks,
        storage: this.config.storage.type,
      });

      // Initialize storage
      await this.initializeStorage();

      // Initialize security (keys, signatures)
      await this.initializeSecurity();

      // Load existing audit chain
      await this.loadAuditChain();

      // Start monitoring
      this.startMonitoring();

      this.isInitialized = true;

      // Record initialization in audit log
      await this.logAuditEvent({
        eventType: 'system_startup',
        category: 'system_access',
        userId: 'system',
        resource: 'audit_logger',
        action: 'initialize',
        outcome: 'success',
        details: {
          version: this.config.serviceVersion,
          compliance: this.config.compliance.frameworks,
          instanceId: this.config.instanceId,
        },
      });

      logger.info('Audit logging service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize audit logging service', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Log a compliance audit event with full traceability.
   *
   * @param {Object} event - Audit event data
   * @param {string} event.eventType - Type of event
   * @param {string} event.category - Event category
   * @param {string} event.userId - User identifier
   * @param {string} event.resource - Resource accessed
   * @param {string} event.action - Action performed
   * @param {string} event.outcome - Event outcome (success/failure)
   * @param {Object} event.details - Additional event details
   * @returns {Promise<string>} Audit event ID
   */
  async logAuditEvent(event) {
    if (!this.isInitialized || !this.config.enabled) {
      return null;
    }

    try {
      const auditEvent = await this.createAuditEvent(event);

      // Add to audit chain for immutability
      await this.addToAuditChain(auditEvent);

      // Store event
      await this.storeAuditEvent(auditEvent);

      // Update compliance tracking
      this.updateComplianceTracking(auditEvent);

      // Emit event for real-time monitoring
      this.emit('auditEvent', auditEvent);

      // Record telemetry
      this.telemetry.recordMetric('audit_events_total', 1, {
        category: auditEvent.category,
        outcome: auditEvent.outcome,
      });

      return auditEvent.id;
    } catch (error) {
      logger.error('Failed to log audit event', {
        event,
        error: error.message,
      });

      // Log the failure itself as an audit event
      await this.logSystemEvent('audit_failure', {
        originalEvent: event,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Execute function with audit context for correlation tracking.
   *
   * @param {string} auditEventId - Audit event ID for correlation
   * @param {string} userId - User identifier
   * @param {Function} fn - Function to execute
   * @returns {Promise<any>} Function result
   */
  async withAuditContext(auditEventId, userId, fn) {
    const context = {
      auditEventId,
      userId,
      timestamp: Date.now(),
      correlationId: crypto.randomUUID(),
    };

    return auditContext.run(context, fn);
  }

  /**
   * Get current audit context.
   *
   * @returns {Object|null} Current audit context
   */
  getCurrentAuditContext() {
    return auditContext.getStore() || null;
  }

  /**
   * Create a structured audit event.
   *
   * @private
   * @param {Object} eventData - Raw event data
   * @returns {Promise<Object>} Structured audit event
   */
  async createAuditEvent(eventData) {
    const timestamp = Date.now();
    const eventId = crypto.randomUUID();

    // Get current audit context
    const context = this.getCurrentAuditContext();

    // Validate required fields
    this.validateEventData(eventData);

    // Sanitize sensitive data
    const sanitizedDetails = this.sanitizeSensitiveData(
      eventData.details || {},
    );

    const auditEvent = {
      // Core identifiers
      id: eventId,
      timestamp,
      sequenceNumber: ++this.eventCounter,

      // Service information
      serviceName: this.config.serviceName,
      serviceVersion: this.config.serviceVersion,
      instanceId: this.config.instanceId,

      // Event classification
      eventType: eventData.eventType,
      category: eventData.category,
      severity: eventData.severity || this.calculateSeverity(eventData),

      // Actor information
      userId: eventData.userId,
      sessionId: eventData.sessionId || context?.correlationId,
      ipAddress: eventData.ipAddress,
      userAgent: eventData.userAgent,

      // Resource and action
      resource: eventData.resource,
      action: eventData.action,
      outcome: eventData.outcome,

      // Compliance context
      compliance: {
        frameworks: this.getApplicableFrameworks(eventData),
        retentionRequired: this.calculateRetentionPeriod(eventData),
        sensitivityLevel: this.calculateSensitivityLevel(eventData),
      },

      // Technical context
      technical: {
        correlationId: context?.correlationId || crypto.randomUUID(),
        parentEventId: context?.auditEventId,
        trace: this.telemetry.getCurrentTraceId?.() || null,
        span: this.telemetry.getCurrentSpanId?.() || null,
      },

      // Event details (sanitized)
      details: sanitizedDetails,

      // Integrity information
      integrity: {
        checksum: null, // Will be calculated after event creation
        signature: null, // Will be calculated after event creation
        previousEventHash: this.getLastEventHash(),
      },
    };

    // Calculate integrity checksum
    auditEvent.integrity.checksum = this.calculateEventChecksum(auditEvent);

    // Sign event if digital signatures are enabled
    if (this.config.compliance.digitalSignatures) {
      auditEvent.integrity.signature = await this.signEvent(auditEvent);
    }

    return auditEvent;
  }

  /**
   * Validate audit event data against required fields.
   *
   * @private
   * @param {Object} eventData - Event data to validate
   * @throws {ValidationError} On validation failure
   */
  validateEventData(eventData) {
    const required = this.config.events.requiredFields;

    for (const field of required) {
      if (!eventData[field]) {
        throw new ValidationError(`Required audit field missing: ${field}`);
      }
    }

    // Validate category
    if (!this.config.events.categories.includes(eventData.category)) {
      throw new ValidationError(
        `Invalid event category: ${eventData.category}`,
      );
    }

    // Validate outcome
    const validOutcomes = ['success', 'failure', 'error', 'denied'];
    if (!validOutcomes.includes(eventData.outcome)) {
      throw new ValidationError(`Invalid event outcome: ${eventData.outcome}`);
    }
  }

  /**
   * Sanitize sensitive data from event details.
   *
   * @private
   * @param {Object} details - Event details
   * @returns {Object} Sanitized details
   */
  sanitizeSensitiveData(details) {
    const sanitized = { ...details };
    const sensitiveFields = this.config.events.sensitiveFields;

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    // Deep sanitization for nested objects
    this.sanitizeNestedObjects(sanitized, sensitiveFields);

    return sanitized;
  }

  /**
   * Add audit event to immutable chain.
   *
   * @private
   * @param {Object} auditEvent - Audit event to add
   */
  async addToAuditChain(auditEvent) {
    if (!this.config.compliance.immutableStorage) {
      return;
    }

    const chainEntry = {
      eventId: auditEvent.id,
      timestamp: auditEvent.timestamp,
      hash: auditEvent.integrity.checksum,
      previousHash: this.getLastEventHash(),
      sequenceNumber: auditEvent.sequenceNumber,
    };

    this.auditChain.push(chainEntry);

    // Persist chain state
    await this.persistAuditChain();
  }

  /**
   * Store audit event to configured storage.
   *
   * @private
   * @param {Object} auditEvent - Audit event to store
   */
  async storeAuditEvent(auditEvent) {
    switch (this.config.storage.type) {
      case 'file':
        await this.storeToFile(auditEvent);
        break;
      case 'database':
        await this.storeToDatabase(auditEvent);
        break;
      case 's3':
        await this.storeToS3(auditEvent);
        break;
      default:
        throw new Error(
          `Unsupported storage type: ${this.config.storage.type}`,
        );
    }
  }

  /**
   * Store audit event to file system.
   *
   * @private
   * @param {Object} auditEvent - Audit event to store
   */
  async storeToFile(auditEvent) {
    const fileName = this.generateLogFileName(auditEvent.timestamp);
    const filePath = path.join(this.config.storage.location, fileName);

    let eventData = JSON.stringify(auditEvent) + '\n';

    // Encrypt if enabled
    if (this.config.storage.encryption) {
      eventData = await this.encryptData(eventData);
    }

    // Compress if enabled
    if (this.config.storage.compression) {
      eventData = await this.compressData(eventData);
    }

    await fs.appendFile(filePath, eventData, { flag: 'a' });

    // Check if file rotation is needed
    await this.checkFileRotation(filePath);
  }

  /**
   * Generate compliance report for audit trail.
   *
   * @param {Object} options - Report options
   * @param {Date} options.startDate - Report start date
   * @param {Date} options.endDate - Report end date
   * @param {string[]} options.frameworks - Compliance frameworks to include
   * @returns {Promise<Object>} Compliance report
   */
  async generateComplianceReport(options = {}) {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      endDate = new Date(),
      frameworks = this.config.compliance.frameworks,
    } = options;

    logger.info('Generating compliance report', {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      frameworks,
    });

    const report = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      frameworks,
      summary: {
        totalEvents: 0,
        eventsByCategory: {},
        eventsByOutcome: {},
        violations: [],
        recommendations: [],
      },
      details: {
        events: [],
        integrityStatus: await this.verifyAuditChainIntegrity(),
        retentionCompliance: this.checkRetentionCompliance(),
        securityEvents: [],
      },
    };

    // Populate report with filtered events
    const events = await this.getEventsInDateRange(startDate, endDate);

    for (const event of events) {
      // Check if event applies to requested frameworks
      const applicableFrameworks = event.compliance.frameworks.filter((f) =>
        frameworks.includes(f),
      );

      if (applicableFrameworks.length > 0) {
        report.summary.totalEvents++;

        // Update category counts
        const category = event.category;
        report.summary.eventsByCategory[category] =
          (report.summary.eventsByCategory[category] || 0) + 1;

        // Update outcome counts
        const outcome = event.outcome;
        report.summary.eventsByOutcome[outcome] =
          (report.summary.eventsByOutcome[outcome] || 0) + 1;

        // Add to detailed events
        report.details.events.push({
          id: event.id,
          timestamp: event.timestamp,
          eventType: event.eventType,
          category: event.category,
          outcome: event.outcome,
          userId: event.userId,
          resource: event.resource,
          action: event.action,
          frameworks: applicableFrameworks,
        });
      }
    }

    // Add compliance analysis
    report.analysis = await this.analyzeCompliance(events, frameworks);

    logger.info('Compliance report generated', {
      reportId: report.id,
      totalEvents: report.summary.totalEvents,
      violations: report.summary.violations.length,
    });

    return report;
  }

  /**
   * Verify audit chain integrity.
   *
   * @returns {Promise<Object>} Integrity verification result
   */
  async verifyAuditChainIntegrity() {
    if (!this.config.compliance.immutableStorage) {
      return { enabled: false };
    }

    logger.info('Verifying audit chain integrity');

    const result = {
      enabled: true,
      valid: true,
      totalEvents: this.auditChain.length,
      verifiedEvents: 0,
      errors: [],
    };

    for (let i = 0; i < this.auditChain.length; i++) {
      const entry = this.auditChain[i];

      try {
        // Verify hash chain
        if (i > 0) {
          const previousEntry = this.auditChain[i - 1];
          if (entry.previousHash !== previousEntry.hash) {
            result.valid = false;
            result.errors.push({
              eventId: entry.eventId,
              error: 'Hash chain broken',
              expected: previousEntry.hash,
              actual: entry.previousHash,
            });
          }
        }

        // Verify event signature if available
        if (this.config.compliance.digitalSignatures) {
          const event = await this.getEventById(entry.eventId);
          if (event && !(await this.verifyEventSignature(event))) {
            result.valid = false;
            result.errors.push({
              eventId: entry.eventId,
              error: 'Invalid digital signature',
            });
          }
        }

        result.verifiedEvents++;
      } catch (error) {
        result.valid = false;
        result.errors.push({
          eventId: entry.eventId,
          error: error.message,
        });
      }
    }

    this.lastIntegrityCheck = Date.now();

    logger.info('Audit chain integrity verification completed', {
      valid: result.valid,
      totalEvents: result.totalEvents,
      errors: result.errors.length,
    });

    return result;
  }

  /**
   * Get audit logger health status.
   *
   * @returns {Object} Health status
   */
  getHealth() {
    return {
      initialized: this.isInitialized,
      enabled: this.config.enabled,
      eventCounter: this.eventCounter,
      auditChainLength: this.auditChain.length,
      lastIntegrityCheck: this.lastIntegrityCheck,
      compliance: {
        frameworks: this.config.compliance.frameworks,
        immutableStorage: this.config.compliance.immutableStorage,
        digitalSignatures: this.config.compliance.digitalSignatures,
      },
      storage: {
        type: this.config.storage.type,
        location: this.config.storage.location,
      },
    };
  }

  // Additional helper methods would be implemented here...
  // (initializeStorage, initializeSecurity, calculateSeverity, etc.)
}

/**
 * Validation error for audit events.
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Singleton audit logger instance.
 */
let auditLoggerInstance = null;

/**
 * Get or create the global audit logger instance.
 *
 * @param {Object} options - Configuration options
 * @returns {AuditLogger} Audit logger instance
 */
function getAuditLogger(options = {}) {
  if (!auditLoggerInstance) {
    auditLoggerInstance = new AuditLogger(options);
  }
  return auditLoggerInstance;
}

/**
 * Initialize the global audit logging service.
 *
 * @param {Object} options - Configuration options
 * @returns {Promise<AuditLogger>} Initialized audit logger
 */
async function initializeAuditLogging(options = {}) {
  const auditLogger = getAuditLogger(options);
  await auditLogger.initialize();
  return auditLogger;
}

/**
 * Log an audit event with the global audit logger.
 *
 * @param {Object} event - Audit event data
 * @returns {Promise<string>} Audit event ID
 */
async function logAuditEvent(event) {
  const auditLogger = getAuditLogger();
  return auditLogger.logAuditEvent(event);
}

module.exports = {
  AuditLogger,
  ValidationError,
  getAuditLogger,
  initializeAuditLogging,
  logAuditEvent,
};

module.exports.default = module.exports;
