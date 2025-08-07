/**
 * Enterprise Audit Logging
 * Compliance-grade activity tracking with immutable logs
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

class AuditLogger extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      logDir: options.logDir || path.join(process.cwd(), '.rag-enterprise', 'audit-logs'),
      retention: {
        days: options.retentionDays || 2555, // 7 years default for compliance
        maxSizeMB: options.maxLogSizeMB || 1000,
        compressionEnabled: options.compressionEnabled !== false
      },
      compliance: {
        standards: options.standards || ['SOC2', 'GDPR', 'HIPAA', 'PCI-DSS'],
        immutable: options.immutable !== false,
        encryption: options.encryption !== false,
        digitalSigning: options.digitalSigning !== false
      },
      realtime: {
        enabled: options.realtimeEnabled !== false,
        batchSize: options.batchSize || 100,
        flushInterval: options.flushInterval || 5000, // 5 seconds
        webhookUrl: options.webhookUrl
      },
      categories: {
        authentication: { level: 'HIGH', retention: 2555 },
        authorization: { level: 'HIGH', retention: 2555 },
        dataAccess: { level: 'MEDIUM', retention: 1825 }, // 5 years
        dataModification: { level: 'HIGH', retention: 2555 },
        systemChanges: { level: 'HIGH', retention: 2555 },
        userActivity: { level: 'LOW', retention: 365 },
        apiAccess: { level: 'MEDIUM', retention: 1095 }, // 3 years
        pluginActivity: { level: 'MEDIUM', retention: 1095 },
        complianceEvents: { level: 'CRITICAL', retention: 3650 } // 10 years
      },
      ...options
    };
    
    this.logBuffer = [];
    this.encryptionKey = options.encryptionKey || this._generateEncryptionKey();
    this.signingKey = options.signingKey || this._generateSigningKey();
    this.sequenceNumber = 0;
    
    this._initializeAuditSystem();
  }

  /**
   * Initialize audit logging system
   */
  async _initializeAuditSystem() {
    // Create audit log directories
    await fs.mkdir(this.config.logDir, { recursive: true });
    await fs.mkdir(path.join(this.config.logDir, 'daily'), { recursive: true });
    await fs.mkdir(path.join(this.config.logDir, 'archived'), { recursive: true });
    await fs.mkdir(path.join(this.config.logDir, 'integrity'), { recursive: true });
    
    // Start periodic flush
    if (this.config.realtime.enabled) {
      this.flushTimer = setInterval(() => {
        this._flushLogs();
      }, this.config.realtime.flushInterval);
    }
    
    // Initialize integrity chain
    await this._initializeIntegrityChain();
    
    this.emit('audit_system_initialized');
  }

  /**
   * Log authentication events
   */
  async logAuthentication(event) {
    const auditEvent = {
      _category: 'authentication',
      action: event._action, // login, logout, login_failed, password_change, mfa_enabled
      tenantId: event._tenantId,
      userId: event._userId,
      sessionId: event.sessionId,
      provider: event.provider, // sso, local, api_key
      details: {
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        location: event.location,
        riskScore: event.riskScore,
        mfaUsed: event.mfaUsed,
        deviceFingerprint: event.deviceFingerprint
      },
      result: event.result, // success, failure, blocked
      reason: event.reason, // invalid_credentials, account_locked, etc.
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: event._correlationId || crypto.randomUUID(),
        _severity: this._calculateSeverity('authentication', event._action, event.result)
      }
    };

    return await this._writeAuditLog(auditEvent);
  }

  /**
   * Log authorization events
   */
  async logAuthorization(event) {
    const auditEvent = {
      _category: 'authorization',
      action: event._action, // access_granted, access_denied, permission_changed
      tenantId: event._tenantId,
      userId: event._userId,
      resource: {
        type: event.resourceType, // workspace, plugin, data, api
        id: event.resourceId,
        path: event.resourcePath,
        operation: event.operation // read, write, delete, execute
      },
      permissions: {
        required: event.requiredPermissions,
        granted: event.grantedPermissions,
        roles: event.userRoles,
        groups: event.userGroups
      },
      result: event.result,
      reason: event.reason,
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: event._correlationId || crypto.randomUUID(),
        _severity: this._calculateSeverity('authorization', event._action, event.result)
      }
    };

    return await this._writeAuditLog(auditEvent);
  }

  /**
   * Log data access events
   */
  async logDataAccess(event) {
    const auditEvent = {
      _category: 'dataAccess',
      action: event._action, // read, query, export, download
      tenantId: event._tenantId,
      userId: event._userId,
      workspaceId: event.workspaceId,
      data: {
        type: event.dataType, // document, embedding, pipeline_result
        classification: event.dataClassification, // public, internal, confidential, restricted
        sensitivity: event.dataSensitivity, // none, pii, phi, financial
        recordCount: event.recordCount,
        sizeBytes: event.sizeBytes,
        query: event.query ? this._sanitizeQuery(event.query) : null
      },
      access: {
        method: event.accessMethod, // api, ui, cli, plugin
        source: event.source,
        destination: event.destination
      },
      result: event.result,
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: event._correlationId || crypto.randomUUID(),
        _severity: this._calculateSeverity('dataAccess', event._action, event.result)
      }
    };

    return await this._writeAuditLog(auditEvent);
  }

  /**
   * Log data modification events
   */
  async logDataModification(event) {
    const auditEvent = {
      _category: 'dataModification',
      action: event._action, // create, update, delete, purge
      tenantId: event._tenantId,
      userId: event._userId,
      workspaceId: event.workspaceId,
      data: {
        type: event.dataType,
        classification: event.dataClassification,
        recordsAffected: event.recordsAffected,
        beforeHash: event.beforeHash,
        afterHash: event.afterHash,
        changeType: event.changeType // bulk, individual, migration
      },
      changes: {
        fields: event.changedFields,
        reason: event.changeReason,
        approvalRequired: event.approvalRequired,
        approvedBy: event.approvedBy
      },
      result: event.result,
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: event._correlationId || crypto.randomUUID(),
        _severity: this._calculateSeverity('dataModification', event._action, event.result)
      }
    };

    return await this._writeAuditLog(auditEvent);
  }

  /**
   * Log system configuration changes
   */
  async logSystemChanges(event) {
    const auditEvent = {
      _category: 'systemChanges',
      action: event._action, // config_change, user_management, role_change, integration_change
      tenantId: event._tenantId,
      userId: event._userId,
      system: {
        component: event.component, // sso, quotas, plugins, security
        setting: event.setting,
        oldValue: event.oldValue ? this._sanitizeValue(event.oldValue) : null,
        newValue: event.newValue ? this._sanitizeValue(event.newValue) : null,
        impact: event.impact // low, medium, high, critical
      },
      approval: {
        required: event.approvalRequired,
        approvedBy: event.approvedBy,
        approvalTime: event.approvalTime
      },
      result: event.result,
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: event._correlationId || crypto.randomUUID(),
        _severity: this._calculateSeverity('systemChanges', event._action, event.result)
      }
    };

    return await this._writeAuditLog(auditEvent);
  }

  /**
   * Log API access events
   */
  async logAPIAccess(event) {
    const auditEvent = {
      _category: 'apiAccess',
      action: event._action, // api_call, rate_limit_hit, api_key_used
      tenantId: event._tenantId,
      userId: event._userId,
      api: {
        endpoint: event.endpoint,
        method: event.method,
        version: event.apiVersion,
        key: event.apiKey ? this._hashApiKey(event.apiKey) : null,
        rateLimitRemaining: event.rateLimitRemaining,
        responseTime: event.responseTime,
        responseSize: event.responseSize
      },
      request: {
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        parameters: event.parameters ? this._sanitizeParameters(event.parameters) : null
      },
      result: event.result,
      httpStatus: event.httpStatus,
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: event._correlationId || crypto.randomUUID(),
        _severity: this._calculateSeverity('apiAccess', event._action, event.result)
      }
    };

    return await this._writeAuditLog(auditEvent);
  }

  /**
   * Log compliance events
   */
  async logComplianceEvent(event) {
    const auditEvent = {
      _category: 'complianceEvents',
      action: event._action, // data_retention, privacy_request, breach_detected, audit_requested
      tenantId: event._tenantId,
      compliance: {
        standard: event.standard, // GDPR, HIPAA, SOC2, PCI-DSS
        requirement: event.requirement,
        status: event.status, // compliant, non_compliant, remediated
        evidence: event.evidence,
        riskLevel: event.riskLevel
      },
      details: {
        affectedRecords: event.affectedRecords,
        timeframe: event.timeframe,
        remediation: event.remediation,
        reportedTo: event.reportedTo
      },
      result: event.result,
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: event._correlationId || crypto.randomUUID(),
        _severity: 'CRITICAL'
      }
    };

    return await this._writeAuditLog(auditEvent);
  }

  /**
   * Write audit log with integrity protection
   */
  async _writeAuditLog(auditEvent) {
    // Add sequence number for integrity chain
    auditEvent.sequence = ++this.sequenceNumber;
    
    // Calculate integrity hash
    auditEvent.integrity = await this._calculateIntegrityHash(auditEvent);
    
    // Encrypt sensitive data if enabled
    if (this.config.compliance.encryption) {
      auditEvent = await this._encryptSensitiveFields(auditEvent);
    }
    
    // Digital signature if enabled
    if (this.config.compliance.digitalSigning) {
      auditEvent.signature = await this._signAuditEvent(auditEvent);
    }
    
    // Add to buffer for batch processing
    this.logBuffer.push(auditEvent);
    
    // Immediate flush for critical events
    if (auditEvent.metadata._severity === 'CRITICAL') {
      await this._flushLogs();
    }
    
    // Check buffer size
    if (this.logBuffer.length >= this.config.realtime.batchSize) {
      await this._flushLogs();
    }
    
    this.emit('audit_logged', {
      _category: auditEvent._category,
      _action: auditEvent._action,
      _severity: auditEvent.metadata._severity,
      _correlationId: auditEvent.metadata._correlationId
    });
    
    return auditEvent.metadata.correlationId;
  }

  /**
   * Flush logs to persistent storage
   */
  async _flushLogs() {
    if (this.logBuffer.length === 0) return;
    
    const logsToFlush = [...this.logBuffer];
    this.logBuffer = [];
    
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(this.config.logDir, 'daily', `audit-${today}.jsonl`);
    
    try {
      // Write logs in JSONL format
      const logLines = logsToFlush.map(log => JSON.stringify(log)).join('\n') + '\n';
      await fs.appendFile(logFile, logLines);
      
      // Update integrity chain
      await this._updateIntegrityChain(logsToFlush);
      
      // Send to webhook if configured
      if (this.config.realtime.webhookUrl) {
        await this._sendToWebhook(logsToFlush);
      }
      
      this.emit('logs_flushed', { count: logsToFlush.length, file: logFile });
      
    } catch (error) {
      // Re-add logs to buffer on failure
      this.logBuffer.unshift(...logsToFlush);
      this.emit('flush_failed', { error: error.message, count: logsToFlush.length });
      throw error;
    }
  }

  /**
   * Query audit logs
   */
  async queryLogs(query) {
    const {
      _tenantId,
      _userId,
      _category,
      _action,
      startDate,
      endDate,
      _severity,
      _correlationId,
      limit = 1000,
      offset = 0
    } = query;

    const results = [];
    const startTime = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endTime = endDate ? new Date(endDate) : new Date();

    // Generate list of log files to search
    const filesToSearch = await this._getLogFilesInRange(startTime, endTime);
    
    for (const file of filesToSearch) {
      const logs = await this._readLogFile(file);
      
      for (const log of logs) {
        if (this._matchesQuery(log, query)) {
          results.push(await this._decryptAuditEvent(log));
          
          if (results.length >= limit + offset) {
            break;
          }
        }
      }
      
      if (results.length >= limit + offset) {
        break;
      }
    }

    return {
      results: results.slice(offset, offset + limit),
      total: results.length,
      hasMore: results.length > limit + offset
    };
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(options) {
    const {
      _tenantId,
      standard, // GDPR, HIPAA, SOC2, PCI-DSS
      startDate,
      endDate,
      includeEvidence = false
    } = options;

    const query = {
      _tenantId,
      startDate,
      endDate,
      limit: 10000
    };

    const logs = await this.queryLogs(query);
    
    const report = {
      metadata: {
        _tenantId,
        standard,
        period: { startDate, endDate },
        generatedAt: new Date().toISOString(),
        totalEvents: logs.total
      },
      summary: {
        authenticationEvents: 0,
        authorizationEvents: 0,
        dataAccessEvents: 0,
        dataModificationEvents: 0,
        systemChangeEvents: 0,
        complianceEvents: 0,
        criticalEvents: 0,
        failedEvents: 0
      },
      compliance: {
        requirements: [],
        violations: [],
        recommendations: []
      },
      evidence: includeEvidence ? [] : null
    };

    // Analyze logs for compliance
    for (const log of logs.results) {
      report.summary[log._category + 'Events']++;
      
      if (log.metadata._severity === 'CRITICAL') {
        report.summary.criticalEvents++;
      }
      
      if (log.result === 'failure' || log.result === 'blocked') {
        report.summary.failedEvents++;
      }
      
      // Check compliance requirements
      const complianceCheck = this._checkCompliance(log, standard);
      if (complianceCheck.violation) {
        report.compliance.violations.push(complianceCheck);
      }
      
      if (includeEvidence && complianceCheck.evidence) {
        report.evidence.push({
          logId: log.metadata._correlationId,
          requirement: complianceCheck.requirement,
          evidence: complianceCheck.evidence
        });
      }
    }

    return report;
  }

  /**
   * Verify log integrity
   */
  async verifyIntegrity(options = {}) {
    const { startDate, endDate, _tenantId } = options;
    
    const integrityFile = path.join(this.config.logDir, 'integrity', 'chain.json');
    const _integrityChain = JSON.parse(await fs.readFile(integrityFile, 'utf8'));
    
    const verification = {
      verified: true,
      totalLogs: 0,
      verifiedLogs: 0,
      tamperedLogs: [],
      missingLogs: [],
      integrityBreaks: []
    };

    // Verify each log file
    const filesToVerify = await this._getLogFilesInRange(
      startDate ? new Date(startDate) : new Date(0),
      endDate ? new Date(endDate) : new Date()
    );

    for (const file of filesToVerify) {
      const logs = await this._readLogFile(file);
      
      for (const log of logs) {
        if (_tenantId && log.tenantId !== _tenantId) continue;
        
        verification.totalLogs++;
        
        // Verify integrity hash
        const expectedHash = await this._calculateIntegrityHash(log);
        if (log.integrity !== expectedHash) {
          verification.tamperedLogs.push({
            _correlationId: log.metadata._correlationId,
            sequence: log.sequence,
            file: file
          });
          verification.verified = false;
        } else {
          verification.verifiedLogs++;
        }
        
        // Verify digital signature if present
        if (log.signature && !await this._verifySignature(log)) {
          verification.tamperedLogs.push({
            _correlationId: log.metadata._correlationId,
            reason: 'invalid_signature',
            file: file
          });
          verification.verified = false;
        }
      }
    }

    return verification;
  }

  // Private helper methods
  async _calculateIntegrityHash(auditEvent) {
    const data = {
      sequence: auditEvent.sequence,
      category: auditEvent._category,
      action: auditEvent._action,
      tenantId: auditEvent._tenantId,
      timestamp: auditEvent.metadata.timestamp
    };
    
    return crypto.createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  async _encryptSensitiveFields(auditEvent) {
    const sensitiveFields = ['details', 'data', 'request'];
    
    for (const field of sensitiveFields) {
      if (auditEvent[field]) {
        const cipher = crypto.createCipher('aes-256-gcm', this.encryptionKey);
        let encrypted = cipher.update(JSON.stringify(auditEvent[field]), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        auditEvent[field] = {
          encrypted: true,
          data: encrypted,
          authTag: cipher.getAuthTag().toString('hex')
        };
      }
    }
    
    return auditEvent;
  }

  async _decryptAuditEvent(auditEvent) {
    const sensitiveFields = ['details', 'data', 'request'];
    
    for (const field of sensitiveFields) {
      if (auditEvent[field] && auditEvent[field].encrypted) {
        try {
          const decipher = crypto.createDecipher('aes-256-gcm', this.encryptionKey);
          decipher.setAuthTag(Buffer.from(auditEvent[field].authTag, 'hex'));
          
          let decrypted = decipher.update(auditEvent[field].data, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          
          auditEvent[field] = JSON.parse(decrypted);
        } catch (error) {
          auditEvent[field] = { decryptionError: error.message };
        }
      }
    }
    
    return auditEvent;
  }

  _calculateSeverity(_category, _action, result) {
    const severityMatrix = {
      authentication: {
        login_failed: result === 'blocked' ? 'HIGH' : 'MEDIUM',
        login: 'LOW',
        logout: 'LOW',
        password_change: 'MEDIUM',
        mfa_enabled: 'MEDIUM'
      },
      authorization: {
        access_denied: 'HIGH',
        access_granted: 'LOW',
        permission_changed: 'HIGH'
      },
      dataAccess: {
        read: 'LOW',
        export: 'MEDIUM',
        query: 'LOW'
      },
      dataModification: {
        delete: 'HIGH',
        purge: 'CRITICAL',
        create: 'LOW',
        update: 'MEDIUM'
      },
      systemChanges: {
        config_change: 'HIGH',
        user_management: 'HIGH',
        role_change: 'HIGH'
      }
    };
    
    return severityMatrix[_category]?.[_action] || 'MEDIUM';
  }

  _sanitizeQuery(query) {
    // Remove sensitive data from queries
    return query.replace(/password|token|key|secret/gi, '[REDACTED]');
  }

  _sanitizeValue(value) {
    if (typeof value === 'string' && 
        (value.includes('password') || value.includes('token') || value.includes('key'))) {
      return '[REDACTED]';
    }
    return value;
  }

  _sanitizeParameters(params) {
    const sanitized = { ...params };
    const sensitiveKeys = ['password', 'token', 'key', 'secret', 'credential'];
    
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  _hashApiKey(apiKey) {
    return crypto.createHash('sha256').update(apiKey).digest('hex').substring(0, 16);
  }

  _generateEncryptionKey() {
    return crypto.randomBytes(32);
  }

  _generateSigningKey() {
    return crypto.randomBytes(64);
  }

  async _initializeIntegrityChain() {
    const integrityFile = path.join(this.config.logDir, 'integrity', 'chain.json');
    
    try {
      await fs.access(integrityFile);
    } catch {
      // Create initial integrity chain
      const initialChain = {
        created: new Date().toISOString(),
        lastHash: crypto.createHash('sha256').update('genesis').digest('hex'),
        sequence: 0
      };
      
      await fs.writeFile(integrityFile, JSON.stringify(initialChain, null, 2));
    }
  }

  async _updateIntegrityChain(logs) {
    const integrityFile = path.join(this.config.logDir, 'integrity', 'chain.json');
    const chain = JSON.parse(await fs.readFile(integrityFile, 'utf8'));
    
    for (const log of logs) {
      const blockData = {
        sequence: log.sequence,
        timestamp: log.metadata.timestamp,
        hash: log.integrity,
        previousHash: chain.lastHash
      };
      
      chain.lastHash = crypto.createHash('sha256')
        .update(JSON.stringify(blockData))
        .digest('hex');
      chain.sequence = log.sequence;
    }
    
    chain.lastUpdated = new Date().toISOString();
    await fs.writeFile(integrityFile, JSON.stringify(chain, null, 2));
  }

  async _signAuditEvent(auditEvent) {
    const data = JSON.stringify(auditEvent);
    return crypto.createHmac('sha256', this.signingKey)
      .update(data)
      .digest('hex');
  }

  async _verifySignature(auditEvent) {
    const { signature, ...eventData } = auditEvent;
    const expectedSignature = await this._signAuditEvent(eventData);
    return signature === expectedSignature;
  }

  async _getLogFilesInRange(startDate, endDate) {
    const files = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const filename = `audit-${dateStr}.jsonl`;
      const filepath = path.join(this.config.logDir, 'daily', filename);
      
      try {
        await fs.access(filepath);
        files.push(filepath);
      } catch {
        // File doesn't exist, skip
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return files;
  }

  async _readLogFile(filepath) {
    const content = await fs.readFile(filepath, 'utf8');
    return content.trim().split('\n').map(line => JSON.parse(line));
  }

  _matchesQuery(log, query) {
    if (query.tenantId && log._tenantId !== query._tenantId) return false;
    if (query.userId && log._userId !== query._userId) return false;
    if (query.category && log._category !== query._category) return false;
    if (query.action && log._action !== query._action) return false;
    if (query.severity && log.metadata._severity !== query._severity) return false;
    if (query.correlationId && log.metadata._correlationId !== query._correlationId) return false;
    
    const logTime = new Date(log.metadata.timestamp);
    if (query.startDate && logTime < new Date(query.startDate)) return false;
    if (query.endDate && logTime > new Date(query.endDate)) return false;
    
    return true;
  }

  _checkCompliance(log, standard) {
    // Mock compliance checking - would integrate with actual compliance frameworks
    const requirements = {
      GDPR: ['data_processing_lawfulness', 'consent_management', 'data_subject_rights'],
      HIPAA: ['access_controls', 'audit_logs', 'data_encryption'],
      SOC2: ['access_controls', 'system_monitoring', 'incident_response'],
      'PCI-DSS': ['access_controls', 'network_security', 'data_encryption']
    };
    
    return {
      requirement: requirements[standard]?.[0] || 'general_compliance',
      violation: false,
      evidence: log.metadata._correlationId
    };
  }

  async _sendToWebhook(logs) {
    if (!this.config.realtime.webhookUrl) return;
    
    try {
      // Mock webhook sending - would use actual HTTP client
      console.log(`Sending ${logs.length} audit logs to webhook`);
    } catch (error) {
      this.emit('webhook_failed', { error: error.message, count: logs.length });
    }
  }

  /**
   * Cleanup old logs based on retention policy
   */
  async cleanupOldLogs() {
    const now = new Date();
    const cleanupResults = {
      filesRemoved: 0,
      bytesFreed: 0,
      errors: []
    };

    try {
      const dailyDir = path.join(this.config.logDir, 'daily');
      const files = await fs.readdir(dailyDir);
      
      for (const file of files) {
        if (!file.startsWith('audit-') || !file.endsWith('.jsonl')) continue;
        
        const filepath = path.join(dailyDir, file);
        const stats = await fs.stat(filepath);
        const fileAge = (now - stats.mtime) / (1000 * 60 * 60 * 24); // days
        
        if (fileAge > this.config.retention.days) {
          await fs.unlink(filepath);
          cleanupResults.filesRemoved++;
          cleanupResults.bytesFreed += stats.size;
        }
      }
      
    } catch (error) {
      cleanupResults.errors.push(error.message);
    }

    this.emit('cleanup_completed', cleanupResults);
    return cleanupResults;
  }
}

module.exports = {
  AuditLogger
};


// Ensure module.exports is properly defined
