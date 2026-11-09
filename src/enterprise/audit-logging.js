/**
 * Enterprise Audit Logging
 * Compliance-grade activity tracking with immutable logs
 */

const fsSync = require('fs');
const fs = fsSync.promises;
// eslint-disable-line global-require
const path = require('path');
// eslint-disable-line global-require
const crypto = require('crypto');
// eslint-disable-line global-require
const http = require('http');
const https = require('https');
const { EventEmitter } = require('events');
// eslint-disable-line global-require
const { logger } = require('../utils/logger');
const { warnOnce } = require('../utils/deprecate');

// Records written by 3.8.2 and later carry a sequence, a link to the previous
// record and a keyed hash over the whole record (integrityVersion 3). Version 2
// records have an unkeyed SHA-256 of a few fields; they are still verified, but
// they are not part of a chain.
const INTEGRITY_VERSION = 3;
const LEGACY_HASH_VERSION = 2;
const CHAIN_FILE_VERSION = 3;
const ENCRYPTION_VERSION = 2;
const ENCRYPTION_KEY_ENV = 'RAG_AUDIT_ENCRYPTION_KEY';
const SIGNING_KEY_ENV = 'RAG_AUDIT_SIGNING_KEY';
const SIGNING_KEY_FILE = 'signing.key';
const SIGNING_KEY_BYTES = 64;
const NO_SIGNING_KEY_WARNING_CODE = 'RAG_AUDIT_NO_SIGNING_KEY';
const REPORT_TENANT_WARNING_CODE = 'RAG_DEP_AUDIT_REPORT_NO_TENANT';
const FAR_FUTURE = new Date('9999-12-31T00:00:00Z');

// Report summary counter for each event category
const SUMMARY_KEYS = {
  authentication: 'authenticationEvents',
  authorization: 'authorizationEvents',
  dataAccess: 'dataAccessEvents',
  dataModification: 'dataModificationEvents',
  systemChanges: 'systemChangeEvents',
  apiAccess: 'apiAccessEvents',
  complianceEvents: 'complianceEvents',
};

// An empty signing.key older than this is a crashed write, not a live one
const STALE_KEY_FILE_MS = 5000;
const WEBHOOK_TIMEOUT_MS = 5000;
const WEBHOOK_RETRY_MS = 1000;
const WEBHOOK_MAX_RETRY_MS = 60000;
// Headers the webhook always sets itself
const WEBHOOK_FIXED_HEADERS = new Set([
  'content-type',
  'content-length',
  'host',
  'connection',
  'transfer-encoding',
]);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Check the webhookUrl and webhookHeaders options. The URL must be https,
 * or http for localhost. Messages never repeat the URL or a header value,
 * which can hold a token.
 */
function checkWebhookOptions(url, headers) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new TypeError('AuditLogger: webhookUrl must be a valid URL');
  }
  const local = LOCAL_HOSTS.has(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) {
    throw new TypeError(
      'AuditLogger: webhookUrl must be an https URL (http is allowed only for localhost)',
    );
  }
  if (headers !== undefined) {
    const valid =
      headers &&
      typeof headers === 'object' &&
      !Array.isArray(headers) &&
      Object.entries(headers).every(
        ([name, value]) =>
          /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) &&
          typeof value === 'string' &&
          !/[\r\n]/.test(value),
      );
    if (!valid) {
      throw new TypeError(
        'AuditLogger: webhookHeaders must be an object of header names to string values',
      );
    }
  }
}

const warnedKinds = new Set();

/** Emit a process warning once per process for each kind of message. */
function warnNoSigningKeyOnce(kind, message) {
  if (warnedKinds.has(kind)) return;
  warnedKinds.add(kind);
  process.emitWarning(message, { code: NO_SIGNING_KEY_WARNING_CODE });
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * JSON with sorted keys and no undefined members, so the same record always
 * serializes to the same text whatever order its keys were written in.
 *
 * @param {*} value - A JSON-compatible value
 * @returns {string}
 */
function canonicalize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const members = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`);
    return `{${members.join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  // The expected length is fixed by the HMAC algorithm, so a length mismatch
  // is not secret.
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/** Sequence ranges ({ from, to }) in the order the records were read. */
function addToRanges(ranges, sequence) {
  if (!Number.isSafeInteger(sequence)) return;
  const last = ranges[ranges.length - 1];
  if (last && sequence === last.to + 1) last.to = sequence;
  else if (!last || sequence !== last.to) ranges.push({ from: sequence, to: sequence });
}

/**
 * OpenSSL EVP_BytesToKey with MD5, one iteration and no salt: the key/IV
 * derivation used by the removed crypto.createCipher/createDecipher.
 * D_1 = MD5(pass), D_i = MD5(D_{i-1} || pass); key || iv = D_1 || D_2 || ...
 *
 * @param {Buffer|string} password - Passphrase given to createCipher
 * @param {number} keyLen - Key length in bytes
 * @param {number} ivLen - IV length in bytes (12 for GCM)
 * @returns {{key: Buffer, iv: Buffer}}
 */
function evpBytesToKey(password, keyLen, ivLen) {
  const pass = Buffer.isBuffer(password)
    ? password
    : Buffer.from(String(password), 'utf8');
  const blocks = [];
  let total = 0;
  let prev = Buffer.alloc(0);
  while (total < keyLen + ivLen) {
    prev = crypto
      .createHash('md5')
      .update(Buffer.concat([prev, pass]))
      .digest();
    blocks.push(prev);
    total += prev.length;
  }
  const out = Buffer.concat(blocks);
  return {
    key: out.subarray(0, keyLen),
    iv: out.subarray(keyLen, keyLen + ivLen),
  };
}

/**
 * Records authentication, data access, data change and other audit events
 * in hash-chained logs, with querying, compliance reports and an integrity
 * check.
 */
class AuditLogger extends EventEmitter {
  constructor(_options = {}) {
    super();

    this._config = {
      logDir: _options.logDir,
      memoryLimit: _options.memoryLimit,
      retention: {
        days: _options.retentionDays || 2555, // 7 years default for compliance
        maxSizeMB: _options.maxLogSizeMB || 1000,
        compressionEnabled: _options.compressionEnabled !== false,
      },
      compliance: {
        standards: _options.standards || ['SOC2', 'GDPR', 'HIPAA', 'PCI-DSS'],
        immutable: _options.immutable !== false,
        encryption: _options.encryption !== false,
        digitalSigning: _options.digitalSigning !== false,
      },
      realtime: {
        enabled: _options.realtimeEnabled !== false,
        batchSize: _options.batchSize || 100,
        flushInterval: _options.flushInterval || 5000, // 5 seconds
        webhookUrl: _options.webhookUrl,
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
        complianceEvents: { level: 'CRITICAL', retention: 3650 }, // 10 years
      },
      ..._options,
    };

    // Defaults after the spread, so an explicit undefined still gets them
    if (!this._config.logDir) {
      // Deprecated in 3.9, removed in 4.0: the folder is created on the
      // first write, not here (BH-13)
      this._config.logDir = path.join(
        process.cwd(),
        '.rag-enterprise',
        'audit-logs',
      );
      warnOnce(
        'RAG_DEP_AUDIT_LOG_DIR',
        'AuditLogger: no logDir option, so logs go to .rag-enterprise/audit-logs ' +
          'in the working directory. This default folder is deprecated and will ' +
          'be removed in 4.0; set the logDir option.',
      );
    }
    if (
      !(
        Number.isFinite(this._config.memoryLimit) &&
        this._config.memoryLimit > 0
      )
    ) {
      this._config.memoryLimit = 10000;
    }

    this.logBuffer = [];
    this.encryptionKey = this._resolveEncryptionKey(_options);
    // Resolved on first use (see the signingKey getter), not here: a stored
    // key is created with the log folders, so creating a logger never
    // writes to disk (BH-13)
    this._signingKeyOptions = { signingKey: _options.signingKey };
    this._signingKey = undefined;

    this._chainState = null;
    this._chainLoad = null;
    // chain.json is behind the records in the file: the chain stage of the
    // next flush writes it, so a failure there never writes records again
    this._chainDirty = false;
    this._chainUnsaved = 0;
    this._storageReady = null;
    /** Events discarded by memoryLimit so far (see 'events_dropped'). */
    this.droppedEvents = 0;
    this._failing = {};
    this._flushQueue = Promise.resolve();
    this._drops = [];
    this._listenerWarned = new Set();
    this._flushErrorWarned = false;
    this._writes = new Set();
    // Day of the newest daily file (read on the first flush)
    this._newestDay = undefined;
    this._closing = null;

    // Events written to the log are also POSTed to the webhook, on their own
    // stage: a queue that is retried on later flushes and never holds up
    // the log file or the chain.
    this._webhookQueue = [];
    this._webhookRun = null;
    this._webhookFailures = 0;
    this._webhookRetryAt = 0;
    if (this._config.realtime.webhookUrl) {
      checkWebhookOptions(
        this._config.realtime.webhookUrl,
        _options.webhookHeaders,
      );
    }

    this._initializeAuditSystem();
  }

  /**
   * Start the periodic flush. Nothing touches the file system here: the log
   * folders and integrity chain are created on the first flush, so creating
   * a logger never writes to disk and a folder that can't be created is a
   * flush failure, not an error the caller can't catch (BH-13, BH-14).
   */
  _initializeAuditSystem() {
    if (this._config.realtime.enabled) {
      this.flushTimer = setInterval(() => {
        this._flushLogs();
      }, this._config.realtime.flushInterval);
      if (typeof this.flushTimer.unref === 'function') this.flushTimer.unref();
    }

    // Emitted asynchronously so a listener added after the constructor sees it
    process.nextTick(() => this.emit('audit_system_initialized'));
  }

  /**
   * Create the log folders once; a failure is retried on the next flush.
   * integrity/ is owner-only (0o700), as the stored signing key needs; the
   * chain state is loaded by the first flush (_loadChainState).
   * @private
   */
  _ensureStorage() {
    if (!this._storageReady) {
      this._storageReady = (async () => {
        for (const dir of ['daily', 'archived', 'integrity']) {
          await fs.mkdir(path.join(this._config.logDir, dir), {
            recursive: true,
            ...(dir === 'integrity' ? { mode: 0o700 } : {}),
          });
        }
      })().catch((error) => {
        this._storageReady = null;
        throw error;
      });
    }
    return this._storageReady;
  }

  /**
   * The key for the integrity hashes and signatures: the signingKey option,
   * then RAG_AUDIT_SIGNING_KEY, then the key stored in
   * `logDir/integrity/signing.key`. Resolved on first use.
   * @returns {Buffer|string}
   */
  get signingKey() {
    if (this._signingKey === undefined) {
      this._signingKey = this._resolveSigningKey(this._signingKeyOptions);
    }
    return this._signingKey;
  }

  /** @param {Buffer|string} key */
  set signingKey(key) {
    this._signingKey = key;
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
        deviceFingerprint: event.deviceFingerprint,
      },
      result: event.result, // success, failure, blocked
      reason: event.reason, // invalid_credentials, account_locked, etc.
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: event._correlationId || crypto.randomUUID(),
        _severity: this._calculateSeverity(
          'authentication',
          event._action,
          event.result,
        ),
      },
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
        operation: event.operation, // read, write, delete, execute
      },
      permissions: {
        required: event.requiredPermissions,
        granted: event.grantedPermissions,
        roles: event.userRoles,
        groups: event.userGroups,
      },
      result: event.result,
      reason: event.reason,
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: event._correlationId || crypto.randomUUID(),
        _severity: this._calculateSeverity(
          'authorization',
          event._action,
          event.result,
        ),
      },
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
        query: event.query ? this._sanitizeQuery(event.query) : null,
      },
      access: {
        method: event.accessMethod, // api, ui, cli, plugin
        source: event.source,
        destination: event.destination,
      },
      result: event.result,
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: event._correlationId || crypto.randomUUID(),
        _severity: this._calculateSeverity(
          'dataAccess',
          event._action,
          event.result,
        ),
      },
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
        _type: event.dataType,
        classification: event.dataClassification,
        recordsAffected: event.recordsAffected,
        beforeHash: event.beforeHash,
        afterHash: event.afterHash,
        changeType: event.changeType, // bulk, individual, migration
      },
      changes: {
        fields: event.changedFields,
        reason: event.changeReason,
        approvalRequired: event.approvalRequired,
        approvedBy: event.approvedBy,
      },
      result: event.result,
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: event._correlationId || crypto.randomUUID(),
        _severity: this._calculateSeverity(
          'dataModification',
          event._action,
          event.result,
        ),
      },
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
        impact: event.impact, // low, medium, high, critical
      },
      approval: {
        required: event.approvalRequired,
        approvedBy: event.approvedBy,
        approvalTime: event.approvalTime,
      },
      result: event.result,
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: event._correlationId || crypto.randomUUID(),
        _severity: this._calculateSeverity(
          'systemChanges',
          event._action,
          event.result,
        ),
      },
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
        responseSize: event.responseSize,
      },
      request: {
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        parameters: event.parameters
          ? this._sanitizeParameters(event.parameters)
          : null,
      },
      result: event.result,
      httpStatus: event.httpStatus,
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: event._correlationId || crypto.randomUUID(),
        _severity: this._calculateSeverity(
          'apiAccess',
          event._action,
          event.result,
        ),
      },
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
        riskLevel: event.riskLevel,
      },
      details: {
        affectedRecords: event.affectedRecords,
        timeframe: event.timeframe,
        remediation: event.remediation,
        reportedTo: event.reportedTo,
      },
      result: event.result,
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: event._correlationId || crypto.randomUUID(),
        _severity: 'CRITICAL',
      },
    };

    return await this._writeAuditLog(auditEvent);
  }

  /**
   * Write audit log with integrity protection. Tracks the call so close()
   * can wait for log calls that haven't finished.
   */
  _writeAuditLog(auditEvent) {
    const write = this._writeAuditLogNow(auditEvent);
    this._writes.add(write);
    const done = () => this._writes.delete(write);
    write.then(done, done);
    return write;
  }

  /** @private */
  async _writeAuditLogNow(auditEvent) {
    // The sequence, chain link, integrity hash and signature are assigned
    // when the record is written (see _flushOnce), so they follow the order
    // records reach the file and continue across restarts.
    auditEvent.integrityVersion = INTEGRITY_VERSION;

    // Encrypt sensitive data if enabled
    if (this._config.compliance.encryption) {
      auditEvent = await this._encryptSensitiveFields(auditEvent);
    }

    // Add to buffer for batch processing
    this.logBuffer.push(auditEvent);

    // Immediate flush for critical events
    if (auditEvent.metadata._severity === 'CRITICAL') {
      await this._flushLogs();
    }

    // Check buffer size
    if (this.logBuffer.length >= this._config.realtime.batchSize) {
      await this._flushLogs();
    }

    this.emit('audit_logged', {
      _category: auditEvent._category,
      _action: auditEvent.action,
      _severity: auditEvent.metadata._severity,
      _correlationId: auditEvent.metadata.correlationId,
    });

    return auditEvent.metadata.correlationId;
  }

  /**
   * Flush buffered events in two stages: number and chain them and append
   * them to the daily file, then write the chain state to chain.json. Each
   * stage retries on the next flush, so events are appended to the file
   * exactly once, and a chain.json failure neither repeats nor blocks file
   * writes. Never rejects: a failed stage emits its event (`flush_failed`,
   * `chain_failed`) and logs one warning until it succeeds again (BH-14).
   * The buffer keeps at most memoryLimit events while writes fail; older
   * ones are dropped and reported (`events_dropped`). Flushes run one at a
   * time, so records are numbered and chained in the order they are
   * appended, and the queue always settles: an error in one flush is logged
   * once and the next flush still runs.
   */
  _flushLogs() {
    this._flushQueue = this._flushQueue
      .then(() => this._flushOnce())
      .catch((error) => {
        if (!this._flushErrorWarned) {
          this._flushErrorWarned = true;
          logger.warn(`AuditLogger: a flush failed: ${error.message}`);
        }
      });
    return this._flushQueue;
  }

  /**
   * Shut the logger down: stop the flush timer, wait for log calls in
   * progress, write the buffered events and the pending chain state, and
   * retry any stage that failed once more. Call it before the process
   * exits (for example on SIGTERM). Resolves, never rejects, with what is
   * still pending: `{ pending: { events, chain } }`. Calls made while a
   * close is running share it. A log call after close() still buffers and
   * flushes as before, but there is no timer any more; call close() again
   * to write it.
   * @returns {Promise<{pending: {events: number, chain: boolean}}>}
   */
  close() {
    if (!this._closing) {
      this._closing = (async () => {
        if (this.flushTimer) {
          clearInterval(this.flushTimer);
          this.flushTimer = null;
        }
        await Promise.allSettled([...this._writes]);
        await this._flushLogs();
        // One more pass for a stage that failed during the first
        if (this.logBuffer.length > 0 || this._chainDirty) {
          await this._flushLogs();
        }
        // The webhook: wait for the delivery under way, then try what is
        // left once more, ignoring the retry delay
        await this._deliverWebhook(true);
        await this._deliverWebhook(true);
        return {
          pending: {
            events: this.logBuffer.length,
            chain: this._chainDirty,
            webhook: this._webhookQueue.length,
          },
        };
      })().finally(() => {
        this._closing = null;
      });
    }
    return this._closing;
  }

  /** @private */
  async _flushOnce() {
    if (this.logBuffer.length > 0) {
      const batch = this.logBuffer;
      this.logBuffer = [];
      let advanced = null;
      let written = 0;
      let failure = null;
      const flushed = [];
      try {
        await this._ensureStorage();
        advanced = { ...(await this._loadChainState()) };
        // One file per day of the events, each group numbered and appended
        // in turn, so a failure part-way leaves only whole groups written.
        for (const { day, records } of await this._groupByDay(batch)) {
          const logFile = path.join(
            this._config.logDir,
            'daily',
            `audit-${day}.jsonl`,
          );
          const next = { ...advanced };
          await this._numberRecords(records, next);
          // An earlier failed append can leave half a line; start on a new
          // line so the next record isn't glued onto it.
          const prefix = (await this._endsMidLine(logFile)) ? '\n' : '';
          await fs.appendFile(
            logFile,
            prefix +
              records.map((log) => JSON.stringify(log)).join('\n') +
              '\n',
          );
          advanced = next;
          written += records.length;
          this._newestDay = day;
          flushed.push({ count: records.length, file: logFile });
        }
      } catch (error) {
        failure = error;
      }
      if (failure) {
        // Put the records that were not written back unnumbered: the retry
        // numbers them again from the same chain state.
        const rest = batch.slice(written);
        for (const log of rest) this._stripChainFields(log);
        this.logBuffer = this._bounded([...rest, ...this.logBuffer], 'file');
        this._emitDrops();
        this._stageFailed('file', 'flush_failed', failure, rest.length);
      } else {
        this._stageSucceeded('file');
      }
      if (written > 0) {
        // The records are in the file; the chain state moves with them even
        // if writing chain.json fails (the chain stage retries it).
        this._chainState = advanced;
        this._chainDirty = true;
        this._chainUnsaved += written;
        if (!failure) this._emitDrops();
        for (const entry of flushed) this._emitSafely('logs_flushed', entry);
        if (this._config.realtime.webhookUrl) {
          this._webhookQueue = this._bounded(
            [...this._webhookQueue, ...batch.slice(0, written)],
            'webhook',
          );
          this._emitDrops();
        }
      }
    }

    if (this._chainDirty) {
      try {
        await this._persistChainState();
        this._chainUnsaved = 0;
        this._stageSucceeded('chain');
      } catch (error) {
        this._stageFailed('chain', 'chain_failed', error, this._chainUnsaved);
      }
    }

    // The webhook runs on its own; this only starts a delivery (or a retry).
    this._deliverWebhook();
  }

  /**
   * Start delivering the webhook queue unless a delivery is running or the
   * retry delay after a failure has not passed (`force` ignores the delay).
   * Never rejects; the promise settles when the delivery ends.
   * @private
   */
  _deliverWebhook(force = false) {
    if (this._webhookRun) return this._webhookRun;
    if (this._webhookQueue.length === 0) return Promise.resolve();
    if (!force && Date.now() < this._webhookRetryAt) return Promise.resolve();
    const size = this._config.realtime.batchSize;
    this._webhookRun = (async () => {
      while (this._webhookQueue.length > 0) {
        const chunk = this._webhookQueue.slice(0, size);
        try {
          await this._postWebhook(chunk);
        } catch (error) {
          this._webhookFailures += 1;
          const base = this._config.webhookRetryMs ?? WEBHOOK_RETRY_MS;
          this._webhookRetryAt =
            Date.now() +
            Math.min(
              WEBHOOK_MAX_RETRY_MS,
              base * 2 ** (this._webhookFailures - 1),
            );
          this._stageFailed(
            'webhook',
            'webhook_failed',
            error,
            this._webhookQueue.length,
          );
          return;
        }
        // Sent: take them out by identity (the queue may have been trimmed
        // or grown while the request was running)
        const sent = new Set(chunk);
        this._webhookQueue = this._webhookQueue.filter((r) => !sent.has(r));
        this._webhookFailures = 0;
        this._webhookRetryAt = 0;
        this._stageSucceeded('webhook');
      }
    })()
      .catch(() => {})
      .finally(() => {
        this._webhookRun = null;
      });
    return this._webhookRun;
  }

  /**
   * POST events to the webhook as `{ events: [...] }`. Resolves on a 2xx
   * answer. A redirect, any other status, a network error and a timeout
   * reject with a short message that holds neither the URL, nor a header,
   * nor the events.
   * @private
   */
  _postWebhook(events) {
    const url = new URL(this._config.realtime.webhookUrl);
    const timeoutMs = this._config.webhookTimeoutMs ?? WEBHOOK_TIMEOUT_MS;
    const body = JSON.stringify({ events });
    const headers = {};
    for (const [name, value] of Object.entries(
      this._config.webhookHeaders || {},
    )) {
      if (!WEBHOOK_FIXED_HEADERS.has(name.toLowerCase())) headers[name] = value;
    }
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(body);
    const client = url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      const request = client.request(
        url,
        { method: 'POST', headers, agent: false },
        (response) => {
          response.resume();
          response.on('end', () => {
            const ok = response.statusCode >= 200 && response.statusCode < 300;
            done(ok ? null : new Error(`HTTP ${response.statusCode}`));
          });
          response.on('error', () => done(new Error('response failed')));
        },
      );
      const timer = setTimeout(() => {
        done(new Error(`timed out after ${timeoutMs} ms`));
        request.destroy();
      }, timeoutMs);
      if (typeof timer.unref === 'function') timer.unref();
      request.on('error', (error) =>
        done(new Error(error.code || 'request failed')),
      );
      request.end(body);
    });
  }

  /**
   * Split a batch into runs of records that go in the same daily file, in
   * batch order. A record goes in the file of the day it happened (UTC, as
   * the file names are), never later than today and never earlier than the
   * newest file, so the files stay in the order of the sequence numbers and
   * verifyIntegrity() reads them as one chain.
   * @private
   */
  async _groupByDay(batch) {
    if (this._newestDay === undefined) {
      this._newestDay = await this._newestLogDay();
    }
    const today = new Date().toISOString().slice(0, 10);
    const groups = [];
    let newest = this._newestDay;
    for (const record of batch) {
      const at = new Date(record.metadata && record.metadata.timestamp);
      let day = Number.isNaN(at.getTime()) ? today : at.toISOString().slice(0, 10);
      if (day > today) day = today;
      if (newest && day < newest) day = newest;
      newest = day;
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.records.push(record);
      else groups.push({ day, records: [record] });
    }
    return groups;
  }

  /** The day of the newest daily file, or null when there is none. @private */
  async _newestLogDay() {
    let names;
    try {
      names = await fs.readdir(path.join(this._config.logDir, 'daily'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    let newest = null;
    for (const name of names) {
      const match = /^audit-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name);
      if (match && (!newest || match[1] > newest)) newest = match[1];
    }
    return newest;
  }

  /**
   * The latest memoryLimit events of the buffer; the rest are dropped and
   * counted in droppedEvents. The 'events_dropped' event is emitted by
   * _emitDrops, once the caller has updated the buffer. Dropped events were
   * never numbered, so they leave no gap in the chain.
   * @private
   */
  _bounded(events, stage) {
    const excess = events.length - this._config.memoryLimit;
    if (excess <= 0) return events;
    this.droppedEvents += excess;
    const failing = this._failing[stage];
    if (failing && !failing.droppedWarned) {
      failing.droppedWarned = true;
      logger.warn(
        `AuditLogger: ${excess} event${excess === 1 ? '' : 's'} dropped (${this.droppedEvents} in all): ` +
          `the ${stage} stage is still failing and keeps only the latest ${this._config.memoryLimit}.`,
      );
    }
    this._drops.push({
      count: excess,
      totalDropped: this.droppedEvents,
      stage,
    });
    return events.slice(excess);
  }

  /** @private */
  _stageFailed(stage, eventName, error, count) {
    if (!this._failing[stage]) {
      this._failing[stage] = { droppedWarned: false };
      logger.warn(
        stage === 'file'
          ? `AuditLogger could not write to ${this._config.logDir}: ${error.message}. Events are kept in memory ` +
              `(up to ${this._config.memoryLimit}) and retried on the next flush; ` +
              `${this.droppedEvents} events dropped so far.`
          : stage === 'webhook'
            ? `AuditLogger could not deliver events to the webhook: ${error.message}. The events are in the ` +
              `log file; they are kept in memory (up to ${this._config.memoryLimit}) and sent on a later flush.`
            : `AuditLogger could not write the integrity chain file: ${error.message}. The events are in the ` +
              'log file; the chain file is written on the next flush.',
      );
    }
    this._emitSafely(eventName, { error: error.message, count });
  }

  /** @private */
  _emitDrops() {
    const drops = this._drops;
    this._drops = [];
    for (const drop of drops) this._emitSafely('events_dropped', drop);
  }

  /**
   * Emit a flush event; a listener that throws is logged once per event
   * name, so it can't stop the remaining stages or later flushes.
   * @private
   */
  _emitSafely(name, payload) {
    try {
      this.emit(name, payload);
    } catch (error) {
      if (!this._listenerWarned.has(name)) {
        this._listenerWarned.add(name);
        logger.warn(`AuditLogger: a '${name}' listener threw: ${error.message}`);
      }
    }
  }

  /** @private */
  _stageSucceeded(stage) {
    delete this._failing[stage];
  }

  async _endsMidLine(file) {
    let handle;
    try {
      handle = await fs.open(file, 'r');
      const { size } = await handle.stat();
      if (size === 0) return false;
      const last = Buffer.alloc(1);
      await handle.read(last, 0, 1, size - 1);
      return last[0] !== 0x0a;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    } finally {
      if (handle) await handle.close();
    }
  }

  _stripChainFields(log) {
    delete log.sequence;
    delete log.chainPrev;
    delete log.keyId;
    delete log.signed;
    delete log.integrity;
    delete log.signature;
  }

  /**
   * Give each record its sequence, the link to the previous record, the key
   * id, the integrity hash and (when signing is on) the signature, advancing
   * `state` as it goes.
   * @private
   */
  async _numberRecords(records, state) {
    const keyId = this._keyId();
    for (const record of records) {
      this._stripChainFields(record);
      record.sequence = state.sequence + 1;
      record.chainPrev = state.lastHash;
      record.keyId = keyId;
      // Whether this record is signed is part of what the integrity hash and
      // the chain cover, so removing the signature later is detected whatever
      // the signing setting is at verification time.
      record.signed = Boolean(this._config.compliance.digitalSigning);
      record.integrity = await this._calculateIntegrityHash(record);
      if (this._config.compliance.digitalSigning) {
        record.signature = await this._signAuditEvent(record);
      }
      state.sequence = record.sequence;
      state.lastHash = this._chainLink(record.chainPrev, record.integrity);
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
      offset = 0,
    } = query;

    // Throws for a tenantId that is present but not a string, before any file
    // is read.
    this._resolveTenantFilter(query);

    // Every match is counted (total, hasMore); only the requested page is
    // kept and decrypted.
    const page = [];
    let matched = 0;
    let skippedLines = 0;
    const startTime = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endTime = endDate ? new Date(endDate) : new Date();

    // Generate list of log files to search
    const filesToSearch = await this._getLogFilesInRange(startTime, endTime);

    for (const file of filesToSearch) {
      const entries = await this._readLogEntries(file);
      skippedLines += entries.filter((entry) => !entry.record).length;
      const logs = entries.filter((e) => e.record).map((e) => e.record);

      for (const log of logs) {
        if (this._matchesQuery(log, query)) {
          matched += 1;
          if (matched > offset && matched <= offset + limit) page.push(log);
        }
      }
    }

    const results = [];
    for (const log of page) results.push(await this._decryptAuditEvent(log));

    return {
      results,
      total: matched,
      hasMore: matched > offset + limit,
      // Lines that could not be parsed and were left out of the results.
      skippedLines,
    };
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(_options) {
    const {
      standard, // GDPR, HIPAA, SOC2, PCI-DSS
      startDate,
      endDate,
      includeEvidence = false,
    } = _options;

    if (
      _options.allTenants !== undefined &&
      typeof _options.allTenants !== 'boolean'
    ) {
      throw new TypeError('AuditLogger: allTenants must be a boolean');
    }
    const allTenants = _options.allTenants === true;
    if (allTenants && ('tenantId' in _options || '_tenantId' in _options)) {
      throw new TypeError(
        'AuditLogger: allTenants: true cannot be combined with a tenantId',
      );
    }
    const _tenantId = this._resolveTenantFilter(_options);
    if (!allTenants && _tenantId === undefined) warnOnce(
        REPORT_TENANT_WARNING_CODE,
        'AuditLogger.generateComplianceReport() called without a tenantId covers ' +
          'all tenants. Pass tenantId to scope the report, or allTenants: true to ' +
          'cover all tenants explicitly; a tenant will be required in 4.0.',
      );

    const query = { startDate, endDate, limit: 10000 };
    if (_tenantId !== undefined) query.tenantId = _tenantId;

    const logs = await this.queryLogs(query);

    const report = {
      metadata: {
        _tenantId,
        standard,
        period: { startDate, endDate },
        generatedAt: new Date().toISOString(),
        totalEvents: logs.total,
      },
      summary: {
        authenticationEvents: 0,
        authorizationEvents: 0,
        dataAccessEvents: 0,
        dataModificationEvents: 0,
        systemChangeEvents: 0,
        apiAccessEvents: 0,
        complianceEvents: 0,
        otherEvents: 0,
        criticalEvents: 0,
        failedEvents: 0,
      },
      compliance: {
        requirements: [],
        violations: [],
        recommendations: [],
      },
      evidence: includeEvidence ? [] : null,
    };

    // Analyze logs for compliance
    for (const log of logs.results) {
      report.summary[
        Object.hasOwn(SUMMARY_KEYS, log._category)
          ? SUMMARY_KEYS[log._category]
          : 'otherEvents'
      ]++;

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
          logId: log.metadata.correlationId,
          requirement: complianceCheck.requirement,
          evidence: complianceCheck.evidence,
        });
      }
    }

    return report;
  }

  /**
   * Verify log integrity.
   *
   * Besides the per-record checks it reads the chain: every record carries its
   * sequence, a link to the previous record and a keyed hash over the whole
   * record, and the chain file holds the latest state.
   *
   * - `integrityBreaks`: `{ file, line, sequence, reason }`, where reason is
   *   `edited`, `chain`, `order`, `tail`, `unparseable`, `chain file missing`,
   *   `chain file reset` or `chain file forged`.
   * - `missingLogs`: gaps in the sequence, `{ after, before, count }`.
   * - `unchained`: records written before chain links existed (counted, and
   *   they do not make `verified` false).
   * - `otherKey`: records written with another signing key; they can't be
   *   checked, so `verified` is false.
   * - `secondWriter`: duplicate or interleaved sequences that look like two
   *   writers on one log directory. A break is only reported here when every
   *   record involved verifies and every interleaved run links up on its own;
   *   otherwise it is reported as the tampering it may be.
   */
  async verifyIntegrity(_options = {}) {
    const { startDate, endDate } = _options;
    // Throws for a tenantId that is present but not a string, as queryLogs does.
    const tenantId = this._resolveTenantFilter(_options);
    const keyId = this._keyId();
    const signingOn = this._config.compliance.digitalSigning;
    const chainFilePath = this._chainFilePath();

    const result = {
      verified: true,
      totalLogs: 0,
      verifiedLogs: 0,
      tamperedLogs: [],
      missingLogs: [],
      integrityBreaks: [],
      unchained: { count: 0, ranges: [] },
      otherKey: { count: 0, ranges: [] },
      secondWriter: [],
    };
    const breaks = result.integrityBreaks;

    const rangeStart = startDate ? new Date(startDate) : new Date(0);
    const rangeEnd = endDate ? new Date(endDate) : new Date();
    const files = await this._getLogFilesInRange(rangeStart, rangeEnd);
    const allFiles = await this._getLogFilesInRange(new Date(0), FAR_FUTURE);
    const chainFile = await this._readChainFile();

    // Pass 1: check each record on its own and collect the chained ones.
    const items = [];
    let seenChained = false;
    for (const file of files) {
      for (const { line, record } of await this._readLogEntries(file)) {
        if (!record) {
          breaks.push({ file, line, sequence: null, reason: 'unparseable' });
          continue;
        }
        const inScope = tenantId === undefined || record.tenantId === tenantId;
        if (inScope) result.totalLogs++;
        const sequence = Number.isSafeInteger(record.sequence)
          ? record.sequence
          : null;
        const where = { file, line, sequence };
        // One entry per record: `reason` is the first problem found,
        // `reasons` all of them in the order found.
        let tampered = null;
        const tamper = (reason) => {
          if (!inScope) return;
          if (tampered) {
            tampered.reasons.push(reason);
            return;
          }
          tampered = {
            _correlationId: record.metadata?.correlationId,
            sequence,
            file,
            line,
            reason,
            reasons: [reason],
          };
          result.tamperedLogs.push(tampered);
        };
        const chained = record.integrityVersion === INTEGRITY_VERSION;

        if (chained && record.keyId !== keyId) {
          seenChained = true;
          result.otherKey.count++;
          addToRanges(result.otherKey.ranges, sequence);
          items.push({ boundary: true });
          continue;
        }

        const hashOk = safeEqual(
          record.integrity,
          await this._calculateIntegrityHash(record),
        );
        if (!hashOk) tamper('edited');

        // A signature is required when the record was written with signing on:
        // for v3 records that is their own (hashed) `signed` field, for older
        // records the current setting.
        const expectSignature = chained ? record.signed === true : signingOn;
        let signatureOk = true;
        if (!Object.prototype.hasOwnProperty.call(record, 'signature')) {
          if (expectSignature) {
            signatureOk = false;
            tamper('missing_signature');
          }
        } else if (!(await this._verifySignature(record))) {
          signatureOk = false;
          tamper('invalid_signature');
        }
        if (hashOk && signatureOk && inScope) result.verifiedLogs++;

        if (!chained) {
          if (seenChained) {
            // An unchained record after chained ones is out of place.
            breaks.push({ ...where, reason: 'chain' });
          } else {
            result.unchained.count++;
            addToRanges(result.unchained.ranges, sequence);
          }
          continue;
        }

        seenChained = true;
        if (!hashOk) breaks.push({ ...where, reason: 'edited' });
        if (sequence === null) {
          if (hashOk) breaks.push({ ...where, reason: 'edited' });
          items.push({ boundary: true });
          continue;
        }
        const chainPrev =
          typeof record.chainPrev === 'string' ? record.chainPrev : '';
        const integrity =
          typeof record.integrity === 'string' ? record.integrity : '';
        items.push({
          ...where,
          seq: sequence,
          chainPrev,
          link: this._chainLink(chainPrev, integrity),
          valid: hashOk && signatureOk,
        });
      }
    }

    // What the chain file says about itself, and its start-of-segment links.
    const chainBreak = (reason, sequence = null) =>
      breaks.push({ file: chainFilePath, line: null, sequence, reason });
    const genesisLinks = new Set();
    let chainDoc = null;
    const chainedItems = items.filter((item) => !item.boundary);
    switch (chainFile.status) {
      case 'missing':
        if (seenChained) chainBreak('chain file missing');
        break;
      case 'ok': {
        chainDoc = chainFile.doc;
        const resets = Array.isArray(chainDoc.resets) ? chainDoc.resets : [];
        for (const reset of resets) {
          if (!reset || typeof reset !== 'object') continue;
          if (typeof reset.chainId === 'string') {
            genesisLinks.add(this._genesisLink(reset.chainId));
          }
          const at = new Date(reset.at);
          const outside =
            !Number.isNaN(at.getTime()) && (at < rangeStart || at > rangeEnd);
          if (!outside) chainBreak('chain file reset', reset.afterSequence ?? null);
        }
        break;
      }
      case 'otherKey':
        // Written with another key: it can't be checked. If records of the
        // current key exist it should have been rewritten with this key.
        if (chainedItems.length > 0) chainBreak('chain file forged');
        break;
      default:
        if (seenChained) chainBreak('chain file forged');
    }

    // Pass 2: sequence and link of each chained record against the one
    // before it in the files.
    let previous = null;
    for (const item of items) {
      if (item.boundary) {
        previous = null;
        continue;
      }
      item.before = previous;
      item.issues = [];
      if (previous) {
        if (item.seq <= previous.seq) {
          item.issues.push({ kind: 'order' });
        } else if (item.seq > previous.seq + 1) {
          item.issues.push({
            kind: 'gap',
            after: previous.seq,
            before: item.seq,
            count: item.seq - previous.seq - 1,
          });
        }
        if (
          item.chainPrev !== previous.link &&
          !genesisLinks.has(item.chainPrev)
        ) {
          item.issues.push({ kind: 'chain' });
        }
      }
      previous = item;
    }

    // Pass 3: split the records into runs, each following the links of the
    // one before it. A record whose link points at an earlier record that
    // already has a successor starts a run forked from it.
    const runs = [];
    const tails = new Map();
    const linked = new Map();
    for (const item of chainedItems) {
      let run = tails.get(item.chainPrev);
      if (run) {
        tails.delete(item.chainPrev);
        run.items.push(item);
      } else {
        run = {
          index: runs.length,
          items: [item],
          parent: linked.get(item.chainPrev) || null,
        };
        runs.push(run);
      }
      item.run = run;
      tails.set(item.link, run);
      linked.set(item.link, { run, item });
    }
    const group = runs.map((_, index) => index);
    const find = (index) => {
      let node = index;
      while (group[node] !== node) {
        group[node] = group[group[node]];
        node = group[node];
      }
      return node;
    };
    for (const run of runs) {
      if (run.parent) group[find(run.index)] = find(run.parent.run.index);
    }
    // Forked runs only count as a second writer when every record involved
    // verifies and each run is an unbroken chain (sequences go up by one).
    const groups = new Map();
    for (const run of runs) {
      const id = find(run.index);
      let info = groups.get(id);
      if (!info) {
        info = { runs: 0, clean: true, seen: new Set() };
        groups.set(id, info);
      }
      info.runs++;
      run.items.forEach((item, position) => {
        if (!item.valid) info.clean = false;
        if (position > 0 && item.seq !== run.items[position - 1].seq + 1) {
          info.clean = false;
        }
      });
      if (run.parent && run.items[0].seq !== run.parent.item.seq + 1) {
        info.clean = false;
      }
    }

    // The one predicate for "these breaks are a second writer": several runs
    // forked from each other, all records valid, each run unbroken.
    const isSecondWriterGroup = (id) => {
      const info = groups.get(id);
      return info.runs > 1 && info.clean;
    };

    for (const item of chainedItems) {
      const id = find(item.run.index);
      const info = groups.get(id);
      const switched =
        item.before &&
        item.before.run !== item.run &&
        find(item.before.run.index) === id;
      if (item.issues.length > 0 && isSecondWriterGroup(id) && switched) {
        result.secondWriter.push({
          file: item.file,
          line: item.line,
          sequence: item.seq,
          reason: info.seen.has(item.seq) ? 'duplicate' : 'interleaved',
        });
      } else {
        for (const issue of item.issues) {
          if (issue.kind === 'gap') {
            result.missingLogs.push({
              after: issue.after,
              before: issue.before,
              count: issue.count,
            });
          } else {
            breaks.push({
              file: item.file,
              line: item.line,
              sequence: item.seq,
              reason: issue.kind,
            });
          }
        }
      }
      info.seen.add(item.seq);
    }

    // The last record must be the one the chain file ends at, when the
    // checked range reaches the end of the logs.
    const tailInRange =
      files.length === 0
        ? allFiles.length === 0
        : files[files.length - 1] === allFiles[allFiles.length - 1];
    if (chainDoc && tailInRange) {
      const last = items[items.length - 1];
      if (!last) {
        if (chainDoc.sequence > 0) chainBreak('tail', chainDoc.sequence);
      } else if (
        !last.boundary &&
        (last.seq !== chainDoc.sequence ||
          !safeEqual(last.link, chainDoc.lastHash))
      ) {
        // The chain file may end at the tip of another writer's run. That is a
        // second writer only under the same conditions as everywhere else, and
        // only when the chain file's link is a record in the same group.
        const lastId = find(last.run.index);
        const tip = linked.get(chainDoc.lastHash);
        const otherWriterTip =
          isSecondWriterGroup(lastId) &&
          tip !== undefined &&
          find(tip.run.index) === lastId &&
          tip.item.seq === chainDoc.sequence;
        if (!otherWriterTip) {
          breaks.push({
            file: last.file,
            line: last.line,
            sequence: last.seq,
            reason: 'tail',
          });
        } else if (
          !result.secondWriter.some(
            (entry) => entry.file === last.file && entry.line === last.line,
          )
        ) {
          result.secondWriter.push({
            file: last.file,
            line: last.line,
            sequence: last.seq,
            reason: 'interleaved',
          });
        }
      }
    }

    const rank = new Map(files.map((file, index) => [file, index]));
    const place = (entry) => (rank.has(entry.file) ? rank.get(entry.file) : files.length);
    breaks.sort(
      (a, b) => place(a) - place(b) || (a.line ?? 0) - (b.line ?? 0),
    );

    result.verified =
      result.tamperedLogs.length === 0 &&
      result.missingLogs.length === 0 &&
      breaks.length === 0 &&
      result.secondWriter.length === 0 &&
      result.otherKey.count === 0;
    return result;
  }

  // Private helper methods
  async _calculateIntegrityHash(auditEvent) {
    if (auditEvent.integrityVersion === INTEGRITY_VERSION) {
      // Keyed hash over every field except the hash and the signature. Going
      // through JSON first makes the in-memory record hash the same as the
      // record read back from the file.
      // eslint-disable-next-line no-unused-vars
      const { integrity, signature, ...rest } = auditEvent;
      return this._hmac(
        `rag-audit-event|${canonicalize(JSON.parse(JSON.stringify(rest)))}`,
      );
    }

    // Records written before integrityVersion 2 hashed the non-existent
    // _action/_tenantId fields (always undefined); keep verifying them as-is.
    const isV2 = auditEvent.integrityVersion === LEGACY_HASH_VERSION;
    const data = {
      sequence: auditEvent.sequence,
      category: auditEvent._category,
      action: isV2 ? auditEvent.action : auditEvent._action,
      tenantId: isV2 ? auditEvent.tenantId : auditEvent._tenantId,
      timestamp: auditEvent.metadata?.timestamp,
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  async _encryptSensitiveFields(auditEvent) {
    const sensitiveFields = ['details', 'data', 'request'];

    for (const field of sensitiveFields) {
      if (auditEvent[field]) {
        // Fresh 96-bit IV per field: GCM must never reuse a (key, IV) pair.
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(
          'aes-256-gcm',
          this._getCipherKey(),
          iv,
        );
        let encrypted = cipher.update(
          JSON.stringify(auditEvent[field]),
          'utf8',
          'hex',
        );
        encrypted += cipher.final('hex');

        auditEvent[field] = {
          encrypted: true,
          v: ENCRYPTION_VERSION,
          iv: iv.toString('hex'),
          data: encrypted,
          authTag: cipher.getAuthTag().toString('hex'),
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
          const decipher = this._createDecipher(auditEvent[field]);
          decipher.setAuthTag(Buffer.from(auditEvent[field].authTag, 'hex'));

          let decrypted = decipher.update(
            auditEvent[field].data,
            'hex',
            'utf8',
          );
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
        mfa_enabled: 'MEDIUM',
      },
      authorization: {
        access_denied: 'HIGH',
        access_granted: 'LOW',
        permission_changed: 'HIGH',
      },
      dataAccess: {
        read: 'LOW',
        export: 'MEDIUM',
        query: 'LOW',
      },
      dataModification: {
        delete: 'HIGH',
        purge: 'CRITICAL',
        create: 'LOW',
        update: 'MEDIUM',
      },
      systemChanges: {
        config_change: 'HIGH',
        user_management: 'HIGH',
        role_change: 'HIGH',
      },
    };

    return severityMatrix[_category]?.[_action] || 'MEDIUM';
  }

  _sanitizeQuery(query) {
    // Remove sensitive data from queries
    return query.replace(/password|token|key|secret/gi, '[REDACTED]');
  }

  _sanitizeValue(value) {
    if (
      typeof value === 'string' &&
      (value.includes('password') ||
        value.includes('token') ||
        value.includes('key'))
    ) {
      return '[REDACTED]';
    }
    return value;
  }

  _sanitizeParameters(params) {
    const sanitized = { ...params };
    const sensitiveKeys = ['password', 'token', 'key', 'secret', 'credential'];

    for (const key of Object.keys(sanitized)) {
      if (
        sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive))
      ) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  _hashApiKey(apiKey) {
    return crypto
      .createHash('sha256')
      .update(apiKey)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Resolve the field-encryption key.
   *
   * Order: the `encryptionKey` option, then the RAG_AUDIT_ENCRYPTION_KEY
   * environment variable (used as a passphrase, like a string option). A
   * random per-process key is never generated: records written with it
   * could not be decrypted after a restart.
   *
   * If encryption is enabled but no key is configured, encryption is
   * disabled for this instance with a loud warning (an `encryption_disabled`
   * event is also emitted on the next tick). Pass `requireEncryption: true`
   * to throw instead.
   *
   * @param {Object} _options - Constructor options
   * @returns {Buffer|string|null} Key material, or null when unavailable
   * @private
   */
  _resolveEncryptionKey(_options) {
    const configured =
      _options.encryptionKey || process.env[ENCRYPTION_KEY_ENV] || null;
    if (configured || !this._config.compliance.encryption) {
      return configured;
    }

    const message =
      `AuditLogger: encryption is enabled but no key is configured. Set the ` +
      `encryptionKey option or the ${ENCRYPTION_KEY_ENV} environment variable.`;

    if (_options.requireEncryption === true) {
      throw new Error(message);
    }

    logger.warn(
      `[AUDIT] WARNING: ${message} Sensitive audit fields (details, data, ` +
        `request) will be written UNENCRYPTED by this instance. Pass ` +
        `requireEncryption: true to make this an error.`,
    );
    this._config.compliance = {
      ...this._config.compliance,
      encryption: false,
    };
    process.nextTick(() =>
      this.emit('encryption_disabled', { reason: 'no_encryption_key' }),
    );
    return null;
  }

  /**
   * AES-256 needs exactly 32 key bytes. A 32-byte Buffer is used as-is; any
   * other key (e.g. a passphrase string) is reduced with SHA-256.
   */
  _getCipherKey() {
    const key = this.encryptionKey;
    if (Buffer.isBuffer(key) && key.length === 32) return key;
    return crypto.createHash('sha256').update(key).digest();
  }

  _createDecipher(encryptedField) {
    if (!this.encryptionKey) {
      throw new Error(
        `No audit encryption key configured (set encryptionKey or ${ENCRYPTION_KEY_ENV})`,
      );
    }
    if (encryptedField.v === ENCRYPTION_VERSION) {
      return crypto.createDecipheriv(
        'aes-256-gcm',
        this._getCipherKey(),
        Buffer.from(encryptedField.iv, 'hex'),
      );
    }
    // Legacy (v1) records were written with crypto.createCipher, which was
    // removed in Node 22. Re-derive its key and IV exactly as it did and use
    // createDecipheriv so they decrypt on every supported Node version. The
    // passphrase is the raw key material createCipher was given, not the
    // SHA-256-reduced key used for v2 records.
    const { key, iv } = evpBytesToKey(this.encryptionKey, 32, 12);
    return crypto.createDecipheriv('aes-256-gcm', key, iv);
  }

  /**
   * Resolve the key behind the integrity hashes, chain links and signatures.
   *
   * Order: the `signingKey` option, then the RAG_AUDIT_SIGNING_KEY env var,
   * then a key stored in `<logDir>/integrity/signing.key` (created on first
   * use), and only if that file can't be used a random per-process key. A
   * stored key lets the logs be checked after a restart, but anyone who can
   * read the log folder can read it, so it only detects accidental damage and
   * casual edits. Both of the last two warn once per process.
   *
   * @param {Object} _options - Constructor options
   * @returns {Buffer|string} Key material
   * @private
   */
  _resolveSigningKey(_options) {
    const configured =
      _options.signingKey || process.env[SIGNING_KEY_ENV] || null;
    if (configured) return configured;

    const stored = this._storedSigningKey();
    if (stored.key) {
      warnNoSigningKeyOnce(
        'stored',
        'AuditLogger: no signingKey or RAG_AUDIT_SIGNING_KEY, so a key stored ' +
          `with the logs (${stored.file}) is used. A key stored with the logs ` +
          'only detects accidental damage and casual edits, not changes by ' +
          'someone who can read the log folder; set RAG_AUDIT_SIGNING_KEY (or ' +
          'the signingKey option) for that.',
      );
      return stored.key;
    }
    warnNoSigningKeyOnce(
      'fallback',
      `AuditLogger: the stored signing key (${stored.file}) couldn't be used ` +
        `(${stored.reason}), so a random key is used for this process and the ` +
        'audit logs can\'t be checked after a restart. Fix or remove that ' +
        'file, or set RAG_AUDIT_SIGNING_KEY (or the signingKey option).',
    );
    return crypto.randomBytes(SIGNING_KEY_BYTES);
  }

  /**
   * The key stored in `<logDir>/integrity/signing.key` as 128 hex digits and
   * a newline, created if it doesn't exist yet. It is created with the 'wx'
   * flag, so of several processes starting together exactly one writes it and
   * the rest read what it wrote (briefly retrying while it is still empty).
   * Modes are owner-only (0o600 file, 0o700 directory); Windows ignores POSIX
   * modes. A file that exists but is unreadable or invalid is never
   * overwritten. It lives next to chain.json, not under daily/, so it is never
   * read as a log file.
   * @returns {{key: ?Buffer, file: string, reason?: string}}
   * @private
   */
  _storedSigningKey() {
    const dir = path.join(this._config.logDir, 'integrity');
    const file = path.join(dir, SIGNING_KEY_FILE);
    const hexLength = SIGNING_KEY_BYTES * 2;
    const fail = (reason) => ({ key: null, file, reason });
    try {
      fsSync.mkdirSync(dir, { recursive: true, mode: 0o700 });
      for (let attempt = 0; ; attempt++) {
        try {
          fsSync.writeFileSync(
            file,
            `${crypto.randomBytes(SIGNING_KEY_BYTES).toString('hex')}\n`,
            { flag: 'wx', mode: 0o600 },
          );
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
        }
        let text;
        try {
          text = fsSync.readFileSync(file, 'utf8').trim();
        } catch (error) {
          // Another process is replacing an empty file: look again
          if (error.code === 'ENOENT' && attempt < 20) {
            sleepSync(10);
            continue;
          }
          throw error;
        }
        if (text.length === hexLength && /^[0-9a-f]+$/.test(text)) {
          return { key: Buffer.from(text, 'hex'), file };
        }
        // Empty for longer than any process takes to write it: a crash
        // between creating and writing it. Move it aside (only one process
        // wins the rename) and create a new one on the next turn.
        if (text.length === 0 && this._isStale(file)) {
          const stale = `${file}.stale-${process.pid}`;
          try {
            fsSync.renameSync(file, stale);
            fsSync.rmSync(stale, { force: true });
          } catch {
            // lost the race: the winner's new file is read next turn
          }
          continue;
        }
        // Still being written by another process: wait a little.
        if (text.length >= hexLength || attempt >= 20) {
          return fail(`it is not a ${hexLength}-digit hex key`);
        }
        sleepSync(10);
      }
    } catch (error) {
      return fail(error.message);
    }
  }

  /** Whether a file was last changed more than a few seconds ago. @private */
  _isStale(file) {
    try {
      return Date.now() - fsSync.statSync(file).mtimeMs > STALE_KEY_FILE_MS;
    } catch {
      return false;
    }
  }

  _hmac(text) {
    return crypto
      .createHmac('sha256', this.signingKey)
      .update(text)
      .digest('hex');
  }

  _keyId() {
    return this._hmac('rag-audit-key-id').slice(0, 16);
  }

  _genesisLink(chainId) {
    return this._hmac(`rag-audit-genesis|${chainId}`);
  }

  _chainLink(chainPrev, integrity) {
    return this._hmac(`rag-audit-chain|${chainPrev}|${integrity}`);
  }

  _stateTag(chainId, sequence, lastHash) {
    return this._hmac(`rag-audit-state|${chainId}|${sequence}|${lastHash}`);
  }

  _chainFilePath() {
    return path.join(this._config.logDir, 'integrity', 'chain.json');
  }

  /**
   * Read chain.json. Status is `missing`, `unreadable`, `legacy` (a file from
   * before 3.8.2), `invalid` (wrong shape, or a state tag that doesn't match
   * under this key), `otherKey` (written with another signing key) or `ok`.
   * @private
   */
  async _readChainFile() {
    let raw;
    try {
      raw = await fs.readFile(this._chainFilePath(), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return { status: 'missing' };
      throw error;
    }
    let doc;
    try {
      doc = JSON.parse(raw);
    } catch {
      return { status: 'unreadable' };
    }
    if (!doc || typeof doc !== 'object' || doc.version !== CHAIN_FILE_VERSION) {
      return { status: 'legacy', doc };
    }
    if (
      typeof doc.chainId !== 'string' ||
      !Number.isSafeInteger(doc.sequence) ||
      doc.sequence < 0 ||
      typeof doc.lastHash !== 'string' ||
      typeof doc.stateTag !== 'string'
    ) {
      return { status: 'invalid', doc };
    }
    const expected = this._stateTag(doc.chainId, doc.sequence, doc.lastHash);
    if (!safeEqual(doc.stateTag, expected)) {
      return { status: doc.keyId === this._keyId() ? 'invalid' : 'otherKey', doc };
    }
    return { status: 'ok', doc };
  }

  /**
   * The chain state (chain id, last sequence and link), loaded once, at the
   * first write.
   * @private
   */
  _loadChainState() {
    if (this._chainState) return Promise.resolve(this._chainState);
    if (!this._chainLoad) {
      this._chainLoad = this._recoverChainState().then(
        (state) => {
          this._chainState = state;
          this._chainLoad = null;
          return state;
        },
        (error) => {
          this._chainLoad = null;
          throw error;
        },
      );
    }
    return this._chainLoad;
  }

  /**
   * Work out where the chain stands before the first write of this process.
   *
   * - chain.json is valid and the newest records don't go past it: continue.
   * - Records go past it and link from it (the process ended after the
   *   file was appended to but before chain.json was rewritten): advance the state and continue.
   * - Otherwise (chain.json missing, replaced, not valid under this key, or
   *   records that don't link) a new chain segment starts. It is never
   *   silent: it is recorded in chain.json `resets`, logged as a warning and
   *   emitted as `chain_reset`, and the sequence carries on from the highest
   *   one in the files. A chain problem never blocks logging.
   * @private
   */
  async _recoverChainState() {
    const keyId = this._keyId();
    const chainFile = await this._readChainFile();
    const files = await this._getLogFilesInRange(new Date(0), FAR_FUTURE);

    if (chainFile.status === 'ok') {
      const { doc } = chainFile;
      const state = {
        chainId: doc.chainId,
        keyId,
        created: doc.created,
        sequence: doc.sequence,
        lastHash: doc.lastHash,
        resets: Array.isArray(doc.resets) ? doc.resets : [],
        legacy: doc.legacy,
      };
      const newest = await this._newestChainedRecords(files);
      const past = newest.filter((record) => record.sequence > state.sequence);
      if (past.length === 0) return state;
      if (await this._advanceThrough(state, past)) {
        this._chainDirty = true;
        return state;
      }
      return this._startChainSegment(
        files,
        chainFile,
        'records after the chain file do not link to it',
      );
    }

    const reasons = {
      missing: 'chain file missing',
      unreadable: 'chain file unreadable',
      legacy: 'chain file in an older format',
      invalid: 'chain file failed verification',
      otherKey: 'signing key changed',
    };
    return this._startChainSegment(files, chainFile, reasons[chainFile.status]);
  }

  /** Chained records of the newest daily file that has any, in file order. */
  async _newestChainedRecords(files) {
    for (let i = files.length - 1; i >= 0; i--) {
      const records = (await this._readLogEntries(files[i]))
        .map((entry) => entry.record)
        .filter(
          (record) =>
            record &&
            record.integrityVersion === INTEGRITY_VERSION &&
            Number.isSafeInteger(record.sequence),
        );
      if (records.length > 0) return records;
    }
    return [];
  }

  /**
   * Move `state` forward over `records` if they continue it exactly: this
   * key, consecutive sequences, each linked to the one before and with a
   * valid hash. Leaves `state` alone otherwise.
   * @private
   */
  async _advanceThrough(state, records) {
    let sequence = state.sequence;
    let lastHash = state.lastHash;
    for (const record of records) {
      if (
        record.keyId !== state.keyId ||
        record.sequence !== sequence + 1 ||
        record.chainPrev !== lastHash ||
        !safeEqual(record.integrity, await this._calculateIntegrityHash(record))
      ) {
        return false;
      }
      lastHash = this._chainLink(record.chainPrev, record.integrity);
      sequence = record.sequence;
    }
    state.sequence = sequence;
    state.lastHash = lastHash;
    return true;
  }

  /**
   * Start a chain: fresh when no chained records exist yet (keeping the
   * values of a pre-3.8.2 chain.json under `legacy`), or a new segment that
   * continues the sequence when they do.
   * @private
   */
  async _startChainSegment(files, chainFile, reason) {
    let highest = 0;
    let chained = false;
    for (const file of files) {
      for (const { record } of await this._readLogEntries(file)) {
        if (
          record &&
          record.integrityVersion === INTEGRITY_VERSION &&
          Number.isSafeInteger(record.sequence)
        ) {
          chained = true;
          highest = Math.max(highest, record.sequence);
        }
      }
    }

    const doc =
      chainFile.doc && typeof chainFile.doc === 'object' ? chainFile.doc : null;
    let legacy;
    if (doc && doc.legacy && typeof doc.legacy === 'object') {
      legacy = doc.legacy;
    } else if (
      doc &&
      doc.version !== CHAIN_FILE_VERSION &&
      typeof doc.lastHash === 'string' &&
      Number.isSafeInteger(doc.sequence)
    ) {
      legacy = { lastHash: doc.lastHash, sequence: doc.sequence };
    }

    const now = new Date().toISOString();
    const chainId = crypto.randomUUID();
    const state = {
      chainId,
      keyId: this._keyId(),
      created: now,
      sequence: highest,
      lastHash: this._genesisLink(chainId),
      resets: [],
      legacy,
    };
    if (chained) {
      if (doc && Array.isArray(doc.resets)) {
        state.resets = doc.resets.filter(
          (entry) => entry && typeof entry === 'object',
        );
      }
      const entry = { at: now, afterSequence: highest, reason, chainId };
      state.resets.push(entry);
      logger.warn(
        `AuditLogger: ${reason}; started a new integrity chain after sequence ${highest}`,
      );
      this.emit('chain_reset', entry);
    }
    this._chainDirty = true;
    return state;
  }

  /**
   * Write chain.json with the latest state. If the write fails it rejects,
   * and the state is kept and written on the next flush.
   * @private
   */
  async _persistChainState() {
    const state = this._chainState;
    if (!state) return;
    const doc = {
      version: CHAIN_FILE_VERSION,
      chainId: state.chainId,
      keyId: state.keyId,
      created: state.created,
      sequence: state.sequence,
      lastHash: state.lastHash,
      stateTag: this._stateTag(state.chainId, state.sequence, state.lastHash),
      resets: state.resets,
    };
    if (state.legacy) doc.legacy = state.legacy;

    const file = this._chainFilePath();
    const temp = `${file}.${process.pid}.tmp`;
    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(temp, JSON.stringify(doc, null, 2));
      await fs.rename(temp, file);
      this._chainDirty = false;
    } catch (error) {
      await fs.rm(temp, { force: true }).catch(() => {});
      // _flushOnce reports it (chain_failed, one warning) and retries
      throw error;
    }
  }

  async _signAuditEvent(auditEvent) {
    const data = JSON.stringify(auditEvent);
    return crypto
      .createHmac('sha256', this.signingKey)
      .update(data)
      .digest('hex');
  }

  async _verifySignature(auditEvent) {
    const { signature, ...eventData } = auditEvent;
    if (typeof signature !== 'string') return false;
    const expectedSignature = await this._signAuditEvent(eventData);
    const actual = Buffer.from(signature, 'utf8');
    const expected = Buffer.from(expectedSignature, 'utf8');
    // timingSafeEqual requires equal lengths; a length mismatch is not secret
    // (the expected length is fixed by the HMAC algorithm).
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  }

  /**
   * Daily log files whose date falls in [startDate, endDate]. Files are named
   * by their UTC date (see _flushLogs), so the range is compared on UTC dates
   * too; walking day by day in local time skipped days in timezones ahead of
   * UTC, so verifyIntegrity() and queryLogs() missed whole files.
   * @private
   */
  async _getLogFilesInRange(startDate, endDate) {
    const dailyDir = path.join(this._config.logDir, 'daily');
    let names;
    try {
      names = await fs.readdir(dailyDir);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    const first = new Date(startDate).toISOString().slice(0, 10);
    const last = new Date(endDate).toISOString().slice(0, 10);
    return names
      .map((name) => /^audit-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name))
      .filter((match) => match && match[1] >= first && match[1] <= last)
      .map((match) => match[0])
      .sort()
      .map((name) => path.join(dailyDir, name));
  }

  /**
   * Every non-blank line of a daily file (queryLogs() counts the unreadable ones as skippedLines) as `{ line, record }`, where `record`
   * is null when the line isn't a JSON object (a half-written or damaged
   * line). `line` counts from 1.
   */
  async _readLogEntries(filepath) {
    const content = await fs.readFile(filepath, 'utf8');
    const entries = [];
    content.split('\n').forEach((text, index) => {
      if (text.trim() === '') return;
      let record = null;
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          record = parsed;
        }
      } catch {
        record = null;
      }
      entries.push({ line: index + 1, record });
    });
    return entries;
  }

  /**
   * The tenant a query asks for, or undefined when it names none. A tenantId
   * (or the underscore form `_tenantId`, read only when `tenantId` is absent)
   * that is present must be a string: null, undefined and other types used to
   * match every tenant.
   * @private
   */
  _resolveTenantFilter(query) {
    let key = null;
    if ('tenantId' in query) key = 'tenantId';
    else if ('_tenantId' in query) key = '_tenantId';
    if (key === null) return undefined;
    const value = query[key];
    if (typeof value !== 'string') {
      const kind = value === null ? 'null' : typeof value;
      throw new TypeError(
        `AuditLogger: ${key} must be a string when present (got ${kind}); ` +
          'leave it out to query all tenants',
      );
    }
    return value;
  }

  _matchesQuery(log, query) {
    // Accept both plain (userId) and underscore (_userId) query keys; the
    // underscore form matches the event input names used by the log* methods.
    // The tenant is resolved separately: it never falls back to the
    // underscore form once `tenantId` is there at all.
    const pick = (key) => query[key] ?? query[`_${key}`];
    const filters = [
      [this._resolveTenantFilter(query), log.tenantId],
      [pick('userId'), log.userId],
      [pick('category'), log._category],
      [pick('action'), log.action],
      [pick('severity'), log.metadata?._severity],
      [pick('correlationId'), log.metadata?.correlationId],
    ];
    for (const [wanted, actual] of filters) {
      if (wanted !== undefined && wanted !== actual) return false;
    }

    const logTime = new Date(log.metadata.timestamp);
    if (query.startDate && logTime < new Date(query.startDate)) return false;
    if (query.endDate && logTime > new Date(query.endDate)) return false;

    return true;
  }

  _checkCompliance(log, standard) {
    // Mock compliance checking - would integrate with actual compliance frameworks
    const requirements = {
      GDPR: [
        'data_processing_lawfulness',
        'consent_management',
        'data_subject_rights',
      ],
      HIPAA: ['access_controls', 'audit_logs', 'data_encryption'],
      SOC2: ['access_controls', 'system_monitoring', 'incident_response'],
      'PCI-DSS': ['access_controls', 'network_security', 'data_encryption'],
    };

    return {
      requirement: requirements[standard]?.[0] || 'general_compliance',
      violation: false,
      evidence: log.metadata.correlationId,
    };
  }

  /**
   * Cleanup old logs based on retention policy
   */
  async cleanupOldLogs() {
    const now = new Date();
    const cleanupResults = {
      filesRemoved: 0,
      bytesFreed: 0,
      errors: [],
    };

    try {
      const dailyDir = path.join(this._config.logDir, 'daily');
      const files = await fs.readdir(dailyDir);

      for (const file of files) {
        if (!file.startsWith('audit-') || !file.endsWith('.jsonl')) continue;

        const filepath = path.join(dailyDir, file);
        const stats = await fs.stat(filepath);
        const fileAge = (now - stats.mtime) / (1000 * 60 * 60 * 24); // days

        if (fileAge > this._config.retention.days) {
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
  AuditLogger,
};

// Ensure module.exports is properly defined
