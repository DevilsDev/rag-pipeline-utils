"use strict";

/**
 * Secure Logger with Automatic Secret Redaction
 *
 * Provides utilities for logging data while automatically redacting sensitive
 * information like API keys, tokens, passwords, and other secrets.
 *
 * Features:
 * - Pattern-based redaction for common secret types
 * - Custom pattern support via regex
 * - Deep object traversal while preserving structure
 * - Redaction statistics for monitoring
 * - Minimal performance impact (<5ms per log)
 *
 * @module secure-logger
 * @since 2.2.5
 */

/**
 * Default redaction patterns for common secrets
 * Each pattern has a regex and a replacement strategy
 *
 * @private
 */
const DEFAULT_PATTERNS = {
  // API Keys - various formats
  apiKey: {
    regex:
      /\b([a-zA-Z0-9_-]*(?:api[_-]?key|apikey|key)[a-zA-Z0-9_-]*[:=]\s*)(['"]?)([a-zA-Z0-9_\-]{16,})(['"]?)/gi,
    replacement: (match, prefix, quote1, key, quote2) =>
      `${prefix}${quote1}[REDACTED_API_KEY]${quote2}`,
    description: "API keys in key-value format",
  },

  // Bearer tokens
  bearerToken: {
    regex: /\b(bearer\s+)([a-zA-Z0-9_\-\.=]+)/gi,
    replacement: "$1[REDACTED_BEARER_TOKEN]",
    description: "Bearer authentication tokens",
  },

  // JWT tokens
  jwt: {
    regex: /\b(eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]+)/g,
    replacement: "[REDACTED_JWT]",
    description: "JSON Web Tokens",
  },

  // AWS Access Keys
  awsAccessKey: {
    regex: /\b(AKIA[0-9A-Z]{16})\b/g,
    replacement: "[REDACTED_AWS_KEY]",
    description: "AWS access keys",
  },

  // AWS Secret Keys
  awsSecretKey: {
    regex:
      /\b(aws[_-]?secret[_-]?access[_-]?key[:=]\s*)(['"]?)([a-zA-Z0-9/+=]{40})(['"]?)/gi,
    replacement: (match, prefix, quote1, key, quote2) =>
      `${prefix}${quote1}[REDACTED_AWS_SECRET]${quote2}`,
    description: "AWS secret access keys",
  },

  // Generic passwords
  password: {
    regex:
      /\b([a-zA-Z0-9_-]*password[a-zA-Z0-9_-]*[:=]\s*)(['"]?)([^\s'"]{6,})(['"]?)/gi,
    replacement: (match, prefix, quote1, pwd, quote2) =>
      `${prefix}${quote1}[REDACTED_PASSWORD]${quote2}`,
    description: "Password fields",
  },

  // Generic tokens
  token: {
    regex:
      /\b([a-zA-Z0-9_-]*token[a-zA-Z0-9_-]*[:=]\s*)(['"]?)([a-zA-Z0-9_\-\.=]{16,})(['"]?)/gi,
    replacement: (match, prefix, quote1, token, quote2) =>
      `${prefix}${quote1}[REDACTED_TOKEN]${quote2}`,
    description: "Generic token fields",
  },

  // Generic secrets
  secret: {
    regex:
      /\b([a-zA-Z0-9_-]*secret[a-zA-Z0-9_-]*[:=]\s*)(['"]?)([^\s'"]{6,})(['"]?)/gi,
    replacement: (match, prefix, quote1, secret, quote2) =>
      `${prefix}${quote1}[REDACTED_SECRET]${quote2}`,
    description: "Generic secret fields",
  },

  // Private keys (PEM format)
  privateKey: {
    regex:
      /(-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----)([\s\S]*?)(-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----)/gi,
    replacement: "$1\n[REDACTED_PRIVATE_KEY]\n$3",
    description: "PEM-format private keys",
  },

  // Credit card numbers (basic pattern)
  creditCard: {
    regex: /\b(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4})\b/g,
    replacement: "[REDACTED_CC]",
    description: "Credit card numbers",
  },

  // Email addresses (optional redaction)
  email: {
    regex: /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
    replacement: "[REDACTED_EMAIL]",
    description: "Email addresses",
    enabled: false, // Disabled by default
  },

  // IP addresses (optional redaction)
  ipAddress: {
    regex: /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g,
    replacement: "[REDACTED_IP]",
    description: "IP addresses",
    enabled: false, // Disabled by default
  },
};

/**
 * Field names that commonly contain sensitive data
 * These fields will be redacted regardless of content pattern
 *
 * @private
 */
const SENSITIVE_FIELD_NAMES = new Set([
  "password",
  "passwd",
  "pwd",
  "secret",
  "api_key",
  "apikey",
  "apiKey",
  "access_token",
  "accessToken",
  "refresh_token",
  "refreshToken",
  "auth_token",
  "authToken",
  "bearer_token",
  "bearerToken",
  "private_key",
  "privateKey",
  "client_secret",
  "clientSecret",
  "jwt",
  "authorization",
  "auth",
  "credentials",
  "credential",
]);

/**
 * Secure Logger class
 * Handles redaction of sensitive data from log entries
 *
 * @class SecureLogger
 */
class SecureLogger {
  /**
   * Create a SecureLogger instance
   *
   * @param {Object} options - Configuration options
   * @param {boolean} [options.enabled=true] - Enable/disable redaction
   * @param {Object} [options.patterns=DEFAULT_PATTERNS] - Custom redaction patterns
   * @param {Set<string>} [options.sensitiveFields] - Custom sensitive field names
   * @param {boolean} [options.redactEmails=false] - Redact email addresses
   * @param {boolean} [options.redactIPs=false] - Redact IP addresses
   * @param {boolean} [options.trackStats=true] - Track redaction statistics
   * @param {string} [options.redactionMarker='[REDACTED]'] - Default redaction marker
   */
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.patterns = { ...DEFAULT_PATTERNS, ...(options.patterns || {}) };
    this.sensitiveFields = new Set([
      ...SENSITIVE_FIELD_NAMES,
      ...(options.sensitiveFields || []),
    ]);
    this.trackStats = options.trackStats !== false;
    this.redactionMarker = options.redactionMarker || "[REDACTED]";

    // Enable/disable optional patterns
    if (options.redactEmails) {
      this.patterns.email.enabled = true;
    }
    if (options.redactIPs) {
      this.patterns.ipAddress.enabled = true;
    }

    // Statistics tracking
    this.stats = {
      totalRedactions: 0,
      byPattern: {},
      byFieldName: {},
      totalProcessed: 0,
      totalTimeMs: 0,
    };

    // Pre-compile regex patterns for better performance
    this._compilePatterns();
  }

  /**
   * Pre-compile regex patterns for performance
   *
   * @private
   */
  _compilePatterns() {
    this.compiledPatterns = [];

    for (const [name, pattern] of Object.entries(this.patterns)) {
      if (pattern.enabled === false) continue;

      this.compiledPatterns.push({
        name,
        regex: pattern.regex,
        replacement: pattern.replacement,
        description: pattern.description,
      });
    }
  }

  /**
   * Check if a field name is sensitive
   *
   * @private
   * @param {string} fieldName - Field name to check
   * @returns {boolean} True if field is sensitive
   */
  _isSensitiveField(fieldName) {
    if (typeof fieldName !== "string") return false;

    const lowerName = fieldName.toLowerCase();

    // Direct match
    if (this.sensitiveFields.has(lowerName)) return true;

    // Pattern match (contains sensitive keywords)
    for (const sensitive of this.sensitiveFields) {
      if (lowerName.includes(sensitive.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  /**
   * Redact secrets from a string value
   *
   * @private
   * @param {string} value - String to redact
   * @returns {string} Redacted string
   */
  _redactString(value) {
    if (typeof value !== "string" || !value) return value;

    let redacted = value;
    let hasRedaction = false;

    for (const pattern of this.compiledPatterns) {
      const original = redacted;
      redacted = redacted.replace(pattern.regex, pattern.replacement);

      if (redacted !== original) {
        hasRedaction = true;
        if (this.trackStats) {
          this.stats.totalRedactions++;
          this.stats.byPattern[pattern.name] =
            (this.stats.byPattern[pattern.name] || 0) + 1;
        }
      }
    }

    return redacted;
  }

  /**
   * Redact secrets from any value (deep traversal)
   *
   * @private
   * @param {*} value - Value to redact
   * @param {string} [fieldName=''] - Current field name for context
   * @param {Set} [seen=new Set()] - Circular reference detection
   * @returns {*} Redacted value with preserved structure
   */
  _redactValue(value, fieldName = "", seen = new Set()) {
    // Handle null/undefined
    if (value == null) return value;

    // Circular reference detection
    if (typeof value === "object") {
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);
    }

    // Check if field name is sensitive - redact entire value
    if (fieldName && this._isSensitiveField(fieldName)) {
      if (this.trackStats) {
        this.stats.totalRedactions++;
        this.stats.byFieldName[fieldName] =
          (this.stats.byFieldName[fieldName] || 0) + 1;
      }
      return this.redactionMarker;
    }

    // Handle different types
    if (typeof value === "string") {
      return this._redactString(value);
    }

    if (Array.isArray(value)) {
      return value.map((item, index) =>
        this._redactValue(item, `${fieldName}[${index}]`, new Set(seen)),
      );
    }

    if (typeof value === "object") {
      const redacted = {};
      for (const [key, val] of Object.entries(value)) {
        const newFieldName = fieldName ? `${fieldName}.${key}` : key;
        redacted[key] = this._redactValue(val, newFieldName, new Set(seen));
      }
      return redacted;
    }

    // Primitives (number, boolean, etc.) - return as-is
    return value;
  }

  /**
   * Securely log data with automatic secret redaction
   *
   * Main entry point for secure logging. Redacts sensitive data while
   * preserving the structure of the original data.
   *
   * @param {*} data - Data to log (any type)
   * @param {Object} [options={}] - Logging options
   * @param {boolean} [options.skipRedaction=false] - Skip redaction for this call
   * @param {string[]} [options.additionalFields=[]] - Additional sensitive field names
   * @returns {*} Redacted data safe for logging
   *
   * @example
   * const logger = new SecureLogger();
   * const safeData = logger.secureLog({
   *   username: 'john',
   *   password: 'secret123',
   *   apiKey: 'abc123def456'
   * });
   * // Returns: { username: 'john', password: '[REDACTED]', apiKey: '[REDACTED]' }
   */
  secureLog(data, options = {}) {
    const startTime = process.hrtime.bigint();

    if (!this.enabled || options.skipRedaction) {
      return data;
    }

    // Temporarily add additional sensitive fields
    let originalFields = null;
    if (options.additionalFields && Array.isArray(options.additionalFields)) {
      originalFields = new Set(this.sensitiveFields);
      options.additionalFields.forEach((field) =>
        this.sensitiveFields.add(field),
      );
    }

    try {
      const redacted = this._redactValue(data);

      if (this.trackStats) {
        this.stats.totalProcessed++;
        const endTime = process.hrtime.bigint();
        const durationNs = Number(endTime - startTime);
        this.stats.totalTimeMs += durationNs / 1000000; // Convert ns to ms
      }

      return redacted;
    } finally {
      // Restore original sensitive fields
      if (originalFields !== null) {
        this.sensitiveFields = originalFields;
      }
    }
  }

  /**
   * Add a custom redaction pattern
   *
   * @param {string} name - Pattern name
   * @param {Object} pattern - Pattern configuration
   * @param {RegExp} pattern.regex - Regular expression to match
   * @param {string|Function} pattern.replacement - Replacement string or function
   * @param {string} [pattern.description=''] - Pattern description
   * @param {boolean} [pattern.enabled=true] - Enable pattern
   *
   * @example
   * logger.addPattern('customToken', {
   *   regex: /\bCUST-[A-Z0-9]{16}\b/g,
   *   replacement: '[REDACTED_CUSTOM_TOKEN]',
   *   description: 'Custom application tokens'
   * });
   */
  addPattern(name, pattern) {
    this.patterns[name] = {
      regex: pattern.regex,
      replacement: pattern.replacement,
      description: pattern.description || "",
      enabled: pattern.enabled !== false,
    };
    this._compilePatterns();
  }

  /**
   * Remove a redaction pattern
   *
   * @param {string} name - Pattern name to remove
   * @returns {boolean} True if pattern was removed
   */
  removePattern(name) {
    if (this.patterns[name]) {
      delete this.patterns[name];
      this._compilePatterns();
      return true;
    }
    return false;
  }

  /**
   * Add sensitive field names
   *
   * @param {string|string[]} fields - Field name(s) to add
   *
   * @example
   * logger.addSensitiveFields(['ssn', 'taxId']);
   */
  addSensitiveFields(fields) {
    const fieldsArray = Array.isArray(fields) ? fields : [fields];
    fieldsArray.forEach((field) => this.sensitiveFields.add(field));
  }

  /**
   * Remove sensitive field names
   *
   * @param {string|string[]} fields - Field name(s) to remove
   * @returns {boolean} True if any fields were removed
   */
  removeSensitiveFields(fields) {
    const fieldsArray = Array.isArray(fields) ? fields : [fields];
    let removed = false;
    fieldsArray.forEach((field) => {
      if (this.sensitiveFields.delete(field)) {
        removed = true;
      }
    });
    return removed;
  }

  /**
   * Get redaction statistics
   *
   * @returns {Object} Statistics object
   * @returns {number} stats.totalRedactions - Total redactions performed
   * @returns {number} stats.totalProcessed - Total items processed
   * @returns {number} stats.totalTimeMs - Total processing time in ms
   * @returns {number} stats.averageTimeMs - Average time per item
   * @returns {Object} stats.byPattern - Redactions by pattern name
   * @returns {Object} stats.byFieldName - Redactions by field name
   */
  getStats() {
    return {
      ...this.stats,
      averageTimeMs:
        this.stats.totalProcessed > 0
          ? this.stats.totalTimeMs / this.stats.totalProcessed
          : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalRedactions: 0,
      byPattern: {},
      byFieldName: {},
      totalProcessed: 0,
      totalTimeMs: 0,
    };
  }

  /**
   * Enable or disable redaction
   *
   * @param {boolean} enabled - Enable state
   */
  setEnabled(enabled) {
    this.enabled = !!enabled;
  }

  /**
   * Check if redaction is enabled
   *
   * @returns {boolean} True if enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Get list of active patterns
   *
   * @returns {Array<Object>} Array of pattern metadata
   */
  getActivePatterns() {
    return this.compiledPatterns.map((p) => ({
      name: p.name,
      description: p.description,
    }));
  }

  /**
   * Get list of sensitive field names
   *
   * @returns {string[]} Array of sensitive field names
   */
  getSensitiveFields() {
    return Array.from(this.sensitiveFields);
  }
}

/**
 * Create a secure log function with bound logger instance
 *
 * @param {Object} options - SecureLogger options
 * @returns {Function} Bound secureLog function
 *
 * @example
 * const secureLog = createSecureLog({ redactEmails: true });
 * const safe = secureLog({ email: 'user@example.com' });
 */
function createSecureLog(options = {}) {
  const logger = new SecureLogger(options);
  return (data, logOptions) => logger.secureLog(data, logOptions);
}

// Create default singleton instance
const defaultLogger = new SecureLogger();

/**
 * Default secure log function using singleton logger
 *
 * @param {*} data - Data to log
 * @param {Object} [options={}] - Logging options
 * @returns {*} Redacted data
 */
function secureLog(data, options = {}) {
  return defaultLogger.secureLog(data, options);
}

module.exports = {
  SecureLogger,
  createSecureLog,
  secureLog,
  defaultLogger,
  DEFAULT_PATTERNS,
  SENSITIVE_FIELD_NAMES,
};
