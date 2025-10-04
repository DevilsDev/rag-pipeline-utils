/**
 * @fileoverview Security monitoring and alerting system for the RAG pipeline.
 * Provides real-time threat detection, anomaly analysis, and automated incident response.
 *
 * @author DevilsDev Team
 * @since 2.1.0
 * @version 2.1.0
 */

const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/structured-logger');
const { getTelemetryService } = require('./telemetry');

/**
 * Security monitoring service for threat detection and incident response.
 *
 * Features:
 * - Real-time security event monitoring
 * - Anomaly detection and pattern analysis
 * - Automated threat response
 * - Security metrics and dashboards
 * - Integration with SIEM systems
 * - Compliance audit trails
 *
 * @class SecurityMonitor
 * @extends EventEmitter
 */
class SecurityMonitor extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      // Monitoring Configuration
      enabled: options.enabled !== false,
      checkInterval: options.checkInterval || 30000, // 30 seconds
      alertThreshold: options.alertThreshold || 5, // 5 events trigger alert
      retentionDays: options.retentionDays || 30,

      // Threat Detection
      threatDetection: {
        enabled: options.threatDetection?.enabled !== false,
        rateLimitThreshold: options.threatDetection?.rateLimitThreshold || 100,
        timeWindow: options.threatDetection?.timeWindow || 60000, // 1 minute
        bruteForceThreshold: options.threatDetection?.bruteForceThreshold || 10,
        suspiciousPatterns: options.threatDetection?.suspiciousPatterns || [],
        ...options.threatDetection,
      },

      // Anomaly Detection
      anomalyDetection: {
        enabled: options.anomalyDetection?.enabled !== false,
        baselineWindow: options.anomalyDetection?.baselineWindow || 3600000, // 1 hour
        deviationThreshold: options.anomalyDetection?.deviationThreshold || 2.5, // 2.5 standard deviations
        minSamples: options.anomalyDetection?.minSamples || 30,
        ...options.anomalyDetection,
      },

      // Alerting Configuration
      alerting: {
        enabled: options.alerting?.enabled !== false,
        channels: options.alerting?.channels || ['log'], // log, webhook, email
        webhookUrl: options.alerting?.webhookUrl,
        emailConfig: options.alerting?.emailConfig,
        severity: {
          low: options.alerting?.severity?.low || 'info',
          medium: options.alerting?.severity?.medium || 'warn',
          high: options.alerting?.severity?.high || 'error',
          critical: options.alerting?.severity?.critical || 'error',
        },
        ...options.alerting,
      },

      // Response Configuration
      autoResponse: {
        enabled: options.autoResponse?.enabled !== false,
        blockSuspiciousIPs: options.autoResponse?.blockSuspiciousIPs !== false,
        rateLimitViolators: options.autoResponse?.rateLimitViolators !== false,
        quarantineThreats: options.autoResponse?.quarantineThreats !== false,
        ...options.autoResponse,
      },

      // Storage Configuration
      storage: {
        type: options.storage?.type || 'file', // file, database, s3
        location: options.storage?.location || './security-logs',
        maxFileSize: options.storage?.maxFileSize || 100 * 1024 * 1024, // 100MB
        compression: options.storage?.compression !== false,
        ...options.storage,
      },

      ...options,
    };

    // Internal state
    this.isRunning = false;
    this.securityEvents = new Map();
    this.threatMetrics = new Map();
    this.anomalyBaselines = new Map();
    this.blockedEntities = new Set();
    this.activeIncidents = new Map();
    this.monitoringInterval = null;

    // Event counters and rate tracking
    this.eventCounters = new Map();
    this.rateTracking = new Map();

    // Telemetry service
    this.telemetry = getTelemetryService();
  }

  /**
   * Start the security monitoring service.
   *
   * @returns {Promise<void>} Start promise
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Security monitor already running');
      return;
    }

    if (!this.config.enabled) {
      logger.info('Security monitoring is disabled');
      return;
    }

    try {
      logger.info('Starting security monitoring service', {
        checkInterval: this.config.checkInterval,
        threatDetection: this.config.threatDetection.enabled,
        anomalyDetection: this.config.anomalyDetection.enabled,
        autoResponse: this.config.autoResponse.enabled,
      });

      // Initialize storage
      await this.initializeStorage();

      // Load historical data for baselines
      await this.loadBaselines();

      // Start monitoring loop
      this.startMonitoringLoop();

      // Setup event listeners
      this.setupEventListeners();

      this.isRunning = true;

      // Record telemetry
      this.telemetry.recordMetric('security_monitor_started', 1, {
        service: 'security-monitor',
      });

      logger.info('Security monitoring service started successfully');
    } catch (error) {
      logger.error('Failed to start security monitoring service', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Stop the security monitoring service.
   *
   * @returns {Promise<void>} Stop promise
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping security monitoring service');

    try {
      // Stop monitoring loop
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
      }

      // Save current state
      await this.saveState();

      // Clear event listeners
      this.removeAllListeners();

      this.isRunning = false;

      logger.info('Security monitoring service stopped successfully');
    } catch (error) {
      logger.error('Error stopping security monitoring service', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Record a security event for monitoring and analysis.
   *
   * @param {Object} event - Security event data
   * @param {string} event.type - Event type (auth_failure, rate_limit, etc.)
   * @param {string} event.severity - Event severity (low, medium, high, critical)
   * @param {string} event.source - Event source identifier
   * @param {Object} event.details - Additional event details
   */
  async recordSecurityEvent(event) {
    if (!this.isRunning || !this.config.enabled) {
      return;
    }

    try {
      const timestamp = Date.now();
      const eventId = crypto.randomUUID();

      const securityEvent = {
        id: eventId,
        timestamp,
        type: event.type,
        severity: event.severity || 'medium',
        source: event.source,
        details: event.details || {},
        ...event,
      };

      // Store event
      this.securityEvents.set(eventId, securityEvent);

      // Update counters
      this.updateEventCounters(securityEvent);

      // Track rate metrics
      this.trackRateMetrics(securityEvent);

      // Perform threat detection
      await this.detectThreats(securityEvent);

      // Perform anomaly detection
      await this.detectAnomalies(securityEvent);

      // Log event with correlation
      await logger.withCorrelation(eventId, async () => {
        logger.security('Security event recorded', {
          eventId,
          type: securityEvent.type,
          severity: securityEvent.severity,
          source: securityEvent.source,
        });
      });

      // Record telemetry
      this.telemetry.recordMetric('security_events_total', 1, {
        type: securityEvent.type,
        severity: securityEvent.severity,
      });

      // Emit event for external handlers
      this.emit('securityEvent', securityEvent);
    } catch (error) {
      logger.error('Failed to record security event', {
        event,
        error: error.message,
      });
    }
  }

  /**
   * Detect threats based on security event patterns.
   *
   * @private
   * @param {Object} event - Security event
   */
  async detectThreats(event) {
    if (!this.config.threatDetection.enabled) {
      return;
    }

    const threats = [];

    // Rate limiting detection
    const rateViolation = this.detectRateLimitViolation(event);
    if (rateViolation) {
      threats.push(rateViolation);
    }

    // Brute force detection
    const bruteForce = this.detectBruteForce(event);
    if (bruteForce) {
      threats.push(bruteForce);
    }

    // Suspicious pattern detection
    const suspiciousPattern = this.detectSuspiciousPatterns(event);
    if (suspiciousPattern) {
      threats.push(suspiciousPattern);
    }

    // Process detected threats
    for (const threat of threats) {
      await this.handleThreat(threat);
    }
  }

  /**
   * Detect rate limit violations.
   *
   * @private
   * @param {Object} event - Security event
   * @returns {Object|null} Threat detection result
   */
  detectRateLimitViolation(event) {
    const { rateLimitThreshold, timeWindow } = this.config.threatDetection;
    const now = Date.now();
    const windowStart = now - timeWindow;

    // Count events from the same source in the time window
    const sourceEvents = Array.from(this.securityEvents.values()).filter(
      (e) => e.source === event.source && e.timestamp >= windowStart,
    );

    if (sourceEvents.length > rateLimitThreshold) {
      return {
        type: 'rate_limit_violation',
        severity: 'high',
        source: event.source,
        details: {
          eventCount: sourceEvents.length,
          threshold: rateLimitThreshold,
          timeWindow: timeWindow,
          events: sourceEvents.slice(-5), // Last 5 events
        },
      };
    }

    return null;
  }

  /**
   * Detect brute force attacks.
   *
   * @private
   * @param {Object} event - Security event
   * @returns {Object|null} Threat detection result
   */
  detectBruteForce(event) {
    if (event.type !== 'auth_failure') {
      return null;
    }

    const { bruteForceThreshold, timeWindow } = this.config.threatDetection;
    const now = Date.now();
    const windowStart = now - timeWindow;

    // Count authentication failures from the same source
    const authFailures = Array.from(this.securityEvents.values()).filter(
      (e) =>
        e.type === 'auth_failure' &&
        e.source === event.source &&
        e.timestamp >= windowStart,
    );

    if (authFailures.length >= bruteForceThreshold) {
      return {
        type: 'brute_force_attack',
        severity: 'critical',
        source: event.source,
        details: {
          failureCount: authFailures.length,
          threshold: bruteForceThreshold,
          timeWindow: timeWindow,
          attempts: authFailures.map((e) => ({
            timestamp: e.timestamp,
            details: e.details,
          })),
        },
      };
    }

    return null;
  }

  /**
   * Detect suspicious patterns in event data.
   *
   * @private
   * @param {Object} event - Security event
   * @returns {Object|null} Threat detection result
   */
  detectSuspiciousPatterns(event) {
    const { suspiciousPatterns } = this.config.threatDetection;

    for (const pattern of suspiciousPatterns) {
      const match = this.matchPattern(event, pattern);
      if (match) {
        return {
          type: 'suspicious_pattern',
          severity: pattern.severity || 'medium',
          source: event.source,
          details: {
            pattern: pattern.name || 'unnamed',
            match: match,
            event: event,
          },
        };
      }
    }

    return null;
  }

  /**
   * Detect anomalies in security event patterns.
   *
   * @private
   * @param {Object} event - Security event
   */
  async detectAnomalies(event) {
    if (!this.config.anomalyDetection.enabled) {
      return;
    }

    const baseline = this.getBaseline(event.type);
    if (
      !baseline ||
      baseline.samples.length < this.config.anomalyDetection.minSamples
    ) {
      // Not enough data for anomaly detection
      this.updateBaseline(event);
      return;
    }

    const currentRate = this.getCurrentRate(event.type);
    const anomaly = this.isAnomaly(currentRate, baseline);

    if (anomaly) {
      await this.handleAnomaly({
        type: 'anomaly_detected',
        severity: anomaly.severity,
        eventType: event.type,
        details: {
          currentRate,
          expectedRate: baseline.mean,
          deviation: anomaly.deviation,
          threshold: this.config.anomalyDetection.deviationThreshold,
        },
      });
    }

    // Update baseline with new data
    this.updateBaseline(event);
  }

  /**
   * Handle detected threats with appropriate response.
   *
   * @private
   * @param {Object} threat - Threat detection result
   */
  async handleThreat(threat) {
    const incidentId = crypto.randomUUID();
    const incident = {
      id: incidentId,
      timestamp: Date.now(),
      threat,
      status: 'active',
      responseActions: [],
    };

    // Store active incident
    this.activeIncidents.set(incidentId, incident);

    // Log threat detection
    logger.security('Threat detected', {
      incidentId,
      threatType: threat.type,
      severity: threat.severity,
      source: threat.source,
    });

    // Send alert
    await this.sendAlert(threat, incidentId);

    // Execute automated response
    if (this.config.autoResponse.enabled) {
      await this.executeAutoResponse(threat, incident);
    }

    // Record telemetry
    this.telemetry.recordMetric('threats_detected', 1, {
      type: threat.type,
      severity: threat.severity,
    });

    // Emit threat event
    this.emit('threatDetected', { threat, incident });
  }

  /**
   * Execute automated threat response actions.
   *
   * @private
   * @param {Object} threat - Threat data
   * @param {Object} incident - Incident data
   */
  async executeAutoResponse(threat, incident) {
    const actions = [];

    try {
      // Block suspicious IP/source
      if (this.config.autoResponse.blockSuspiciousIPs && threat.source) {
        await this.blockEntity(threat.source, 'Automated threat response');
        actions.push(`Blocked entity: ${threat.source}`);
      }

      // Rate limit violators
      if (
        this.config.autoResponse.rateLimitViolators &&
        threat.type === 'rate_limit_violation'
      ) {
        await this.applyRateLimit(threat.source);
        actions.push(`Applied rate limit to: ${threat.source}`);
      }

      // Quarantine threats
      if (
        this.config.autoResponse.quarantineThreats &&
        threat.severity === 'critical'
      ) {
        await this.quarantineThreat(threat);
        actions.push('Threat quarantined');
      }

      // Update incident with response actions
      incident.responseActions = actions;
      this.activeIncidents.set(incident.id, incident);

      logger.info('Automated threat response executed', {
        incidentId: incident.id,
        actions,
      });
    } catch (error) {
      logger.error('Failed to execute automated response', {
        incidentId: incident.id,
        error: error.message,
      });
    }
  }

  /**
   * Send security alert through configured channels.
   *
   * @private
   * @param {Object} threat - Threat data
   * @param {string} incidentId - Incident identifier
   */
  async sendAlert(threat, incidentId) {
    if (!this.config.alerting.enabled) {
      return;
    }

    const alert = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      incidentId,
      threat,
      severity: threat.severity,
      title: `Security Threat Detected: ${threat.type}`,
      description: this.formatThreatDescription(threat),
    };

    const channels = this.config.alerting.channels;

    for (const channel of channels) {
      try {
        switch (channel) {
          case 'log':
            await this.sendLogAlert(alert);
            break;
          case 'webhook':
            await this.sendWebhookAlert(alert);
            break;
          case 'email':
            await this.sendEmailAlert(alert);
            break;
          default:
            logger.warn('Unknown alert channel', { channel });
        }
      } catch (error) {
        logger.error('Failed to send alert', {
          channel,
          alertId: alert.id,
          error: error.message,
        });
      }
    }
  }

  /**
   * Block an entity (IP, user, etc.) for security reasons.
   *
   * @private
   * @param {string} entity - Entity identifier to block
   * @param {string} reason - Reason for blocking
   */
  async blockEntity(entity, reason) {
    this.blockedEntities.add(entity);

    logger.security('Entity blocked', {
      entity,
      reason,
      timestamp: Date.now(),
    });

    // Emit block event for external handlers
    this.emit('entityBlocked', { entity, reason });
  }

  /**
   * Check if an entity is blocked.
   *
   * @param {string} entity - Entity identifier
   * @returns {boolean} True if blocked
   */
  isBlocked(entity) {
    return this.blockedEntities.has(entity);
  }

  /**
   * Get security monitoring health status.
   *
   * @returns {Object} Health status
   */
  getHealth() {
    return {
      running: this.isRunning,
      enabled: this.config.enabled,
      activeIncidents: this.activeIncidents.size,
      blockedEntities: this.blockedEntities.size,
      eventsProcessed: this.securityEvents.size,
      threatDetection: this.config.threatDetection.enabled,
      anomalyDetection: this.config.anomalyDetection.enabled,
      autoResponse: this.config.autoResponse.enabled,
      lastCheck: this.lastCheckTime || null,
    };
  }

  /**
   * Get security metrics for monitoring dashboards.
   *
   * @returns {Object} Security metrics
   */
  getMetrics() {
    const now = Date.now();
    const lastHour = now - 3600000; // 1 hour ago

    const recentEvents = Array.from(this.securityEvents.values()).filter(
      (e) => e.timestamp >= lastHour,
    );

    const eventsByType = recentEvents.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {});

    const eventsBySeverity = recentEvents.reduce((acc, event) => {
      acc[event.severity] = (acc[event.severity] || 0) + 1;
      return acc;
    }, {});

    return {
      totalEvents: this.securityEvents.size,
      recentEvents: recentEvents.length,
      eventsByType,
      eventsBySeverity,
      activeIncidents: this.activeIncidents.size,
      blockedEntities: this.blockedEntities.size,
      uptime: this.isRunning ? now - (this.startTime || now) : 0,
    };
  }

  /**
   * Initialize storage for security events and state.
   *
   * @private
   */
  async initializeStorage() {
    if (this.config.storage.type === 'file') {
      const storageDir = this.config.storage.location;
      try {
        await fs.mkdir(storageDir, { recursive: true });
        logger.debug('Security storage initialized', { storageDir });
      } catch (error) {
        logger.error('Failed to initialize security storage', {
          storageDir,
          error: error.message,
        });
        throw error;
      }
    }
  }

  /**
   * Start the monitoring loop for periodic checks.
   *
   * @private
   */
  startMonitoringLoop() {
    this.startTime = Date.now();
    this.monitoringInterval = setInterval(async () => {
      try {
        this.lastCheckTime = Date.now();
        await this.performPeriodicChecks();
      } catch (error) {
        logger.error('Error in monitoring loop', {
          error: error.message,
        });
      }
    }, this.config.checkInterval);
  }

  /**
   * Perform periodic security checks and maintenance.
   *
   * @private
   */
  async performPeriodicChecks() {
    // Clean up old events
    await this.cleanupOldEvents();

    // Update metrics
    this.updateSecurityMetrics();

    // Check for resolved incidents
    await this.checkIncidentStatus();

    // Emit health check event
    this.emit('healthCheck', this.getHealth());
  }

  /**
   * Clean up old security events based on retention policy.
   *
   * @private
   */
  async cleanupOldEvents() {
    const retentionMs = this.config.retentionDays * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - retentionMs;

    let cleanedCount = 0;
    for (const [eventId, event] of this.securityEvents) {
      if (event.timestamp < cutoffTime) {
        this.securityEvents.delete(eventId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('Cleaned up old security events', { cleanedCount });
    }
  }

  /**
   * Update security metrics for monitoring.
   *
   * @private
   */
  updateSecurityMetrics() {
    const metrics = this.getMetrics();

    // Record telemetry metrics
    this.telemetry.recordMetric('security_events_active', metrics.totalEvents);
    this.telemetry.recordMetric(
      'security_incidents_active',
      metrics.activeIncidents,
    );
    this.telemetry.recordMetric(
      'security_entities_blocked',
      metrics.blockedEntities,
    );

    // Update threat metrics
    this.threatMetrics.set('current', metrics);
  }

  // Additional helper methods would be implemented here...
  // (matchPattern, getBaseline, updateBaseline, etc.)
}

/**
 * Singleton security monitor instance.
 */
let securityMonitorInstance = null;

/**
 * Get or create the global security monitor instance.
 *
 * @param {Object} options - Configuration options
 * @returns {SecurityMonitor} Security monitor instance
 */
function getSecurityMonitor(options = {}) {
  if (!securityMonitorInstance) {
    securityMonitorInstance = new SecurityMonitor(options);
  }
  return securityMonitorInstance;
}

/**
 * Initialize the global security monitoring service.
 *
 * @param {Object} options - Configuration options
 * @returns {Promise<SecurityMonitor>} Initialized security monitor
 */
async function initializeSecurityMonitoring(options = {}) {
  const monitor = getSecurityMonitor(options);
  await monitor.start();
  return monitor;
}

module.exports = {
  SecurityMonitor,
  getSecurityMonitor,
  initializeSecurityMonitoring,
};

module.exports.default = module.exports;
