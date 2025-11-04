/**
 * @fileoverview Secure Logging Utility
 * Redacts sensitive values from log messages and objects to prevent secret leakage
 *
 * @author DevilsDev Team
 * @since 2.2.1
 */

'use strict';

/**
 * Sensitive field names that should be redacted
 */
const SENSITIVE_FIELD_NAMES = new Set([
  'password',
  'passwd',
  'pwd',
  'secret',
  'api_key',
  'apiKey',
  'apikey',
  'api-key',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'auth',
  'authorization',
  'authtoken',
  'sessionid',
  'session_id',
  'sessionId',
  'jwt',
  'bearer',
  'private_key',
  'privatekey', // Added lowercase variant
  'privateKey',
  'private-key',
  'client_secret',
  'clientSecret',
  'client-secret',
  'encryption_key',
  'encryptionKey',
  'signing_key',
  'signingKey',
  'oauth_token',
  'oauthToken',
  'credentials',
  'credential',
  'ssn',
  'credit_card',
  'creditCard',
  'cvv',
  'pin',
  'salt',
]);

/**
 * Patterns that match secret-like values
 */
const SECRET_PATTERNS = [
  // AWS credentials
  /AKIA[0-9A-Z]{16}/gi, // AWS Access Key ID
  /aws_secret_access_key\s*=\s*[A-Za-z0-9/+=]{40}/gi,

  // Generic API keys (32+ hex chars, 20+ base64 chars)
  /[a-f0-9]{32,}/gi, // Hex keys
  /[A-Za-z0-9+/]{20,}={0,2}/g, // Base64 keys

  // JWT tokens (3 base64 parts separated by dots)
  /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,

  // Bearer tokens
  /Bearer\s+[A-Za-z0-9_\-\.]+/gi,

  // GitHub tokens
  /gh[pousr]_[A-Za-z0-9]{36}/g,

  // Generic passwords in URL format
  /:\/\/[^:]+:([^@]+)@/g, // Captures password in user:password@host

  // Credit card numbers (basic pattern)
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,

  // SSN pattern
  /\b\d{3}-\d{2}-\d{4}\b/g,
];

/**
 * Redaction marker
 */
const REDACTED = '[REDACTED]';

/**
 * Check if a field name is sensitive
 * @param {string} fieldName - Field name to check
 * @returns {boolean} True if sensitive
 */
function isSensitiveFieldName(fieldName) {
  if (typeof fieldName !== 'string') return false;

  const lowerFieldName = fieldName.toLowerCase();
  return SENSITIVE_FIELD_NAMES.has(lowerFieldName);
}

/**
 * Check if a value matches a secret pattern
 * @param {string} value - Value to check
 * @returns {boolean} True if matches secret pattern
 */
function matchesSecretPattern(value) {
  if (typeof value !== 'string') return false;

  // Skip short values to avoid false positives
  if (value.length < 8) return false;

  // Check against secret patterns
  for (const pattern of SECRET_PATTERNS) {
    // Reset regex lastIndex to avoid stateful regex issues
    pattern.lastIndex = 0;

    if (pattern.test(value)) {
      return true;
    }
  }

  return false;
}

/**
 * Redact a string value if it contains secrets
 * @param {string} value - String value to redact
 * @returns {string} Redacted value if sensitive, original otherwise
 */
function redactStringValue(value) {
  if (typeof value !== 'string') return value;

  // Short strings are unlikely to be secrets
  if (value.length < 8) return value;

  // Check if entire value matches secret pattern
  if (matchesSecretPattern(value)) {
    return REDACTED;
  }

  // Redact parts of the string that match patterns
  let redacted = value;
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, REDACTED);
  }

  return redacted;
}

/**
 * Redact sensitive fields in an object
 * @param {any} obj - Object to redact
 * @param {number} depth - Current recursion depth
 * @param {number} maxDepth - Maximum recursion depth
 * @returns {any} Redacted object
 */
function redactObject(obj, depth = 0, maxDepth = 10) {
  // Prevent infinite recursion
  if (depth > maxDepth) return '[MAX_DEPTH_EXCEEDED]';

  // Handle primitives
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return redactStringValue(obj);
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;

  // Handle Date objects
  if (obj instanceof Date) return obj;

  // Handle Error objects specially to preserve standard properties
  if (obj instanceof Error) {
    const errorObj = {
      name: obj.name,
      message: obj.message,
      stack: obj.stack,
    };

    // Include any other enumerable properties (like code)
    for (const [key, value] of Object.entries(obj)) {
      if (!['name', 'message', 'stack'].includes(key)) {
        errorObj[key] = redactObject(value, depth + 1, maxDepth);
      }
    }

    return errorObj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, depth + 1, maxDepth));
  }

  // Handle objects
  if (typeof obj === 'object') {
    const redacted = {};

    for (const [key, value] of Object.entries(obj)) {
      // For sensitive field names, check the value type
      if (isSensitiveFieldName(key)) {
        // If value is an object, still traverse it to redact nested sensitive fields
        if (
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value)
        ) {
          redacted[key] = redactObject(value, depth + 1, maxDepth);
        } else {
          // For primitives and arrays, redact the entire value
          redacted[key] = REDACTED;
        }
      } else if (typeof value === 'string') {
        // Redact string values that match patterns
        redacted[key] = redactStringValue(value);
      } else if (typeof value === 'object' && value !== null) {
        // Recursively redact nested objects
        redacted[key] = redactObject(value, depth + 1, maxDepth);
      } else {
        // Keep primitive values as-is
        redacted[key] = value;
      }
    }

    return redacted;
  }

  // Default fallback
  return obj;
}

/**
 * Redact sensitive information from log data
 * @param {string} message - Log message
 * @param {object} meta - Log metadata object
 * @returns {object} Redacted message and metadata
 */
function redactLogData(message, meta = {}) {
  const redactedMessage =
    typeof message === 'string' ? redactStringValue(message) : message;

  const redactedMeta = redactObject(meta);

  return {
    message: redactedMessage,
    meta: redactedMeta,
  };
}

/**
 * Create a redacting wrapper for any logger
 * @param {object} logger - Logger instance to wrap
 * @returns {object} Wrapped logger with automatic redaction
 */
function createSecureLogger(logger) {
  return {
    error(message, meta = {}) {
      const { message: redactedMsg, meta: redactedMeta } = redactLogData(
        message,
        meta,
      );
      return logger.error(redactedMsg, redactedMeta);
    },

    warn(message, meta = {}) {
      const { message: redactedMsg, meta: redactedMeta } = redactLogData(
        message,
        meta,
      );
      return logger.warn(redactedMsg, redactedMeta);
    },

    info(message, meta = {}) {
      const { message: redactedMsg, meta: redactedMeta } = redactLogData(
        message,
        meta,
      );
      return logger.info(redactedMsg, redactedMeta);
    },

    debug(message, meta = {}) {
      const { message: redactedMsg, meta: redactedMeta } = redactLogData(
        message,
        meta,
      );
      return logger.debug(redactedMsg, redactedMeta);
    },

    trace(message, meta = {}) {
      const { message: redactedMsg, meta: redactedMeta } = redactLogData(
        message,
        meta,
      );
      return logger.trace(redactedMsg, redactedMeta);
    },

    // Preserve other logger methods
    child(...args) {
      const childLogger = logger.child(...args);
      return createSecureLogger(childLogger);
    },

    withCorrelation(...args) {
      return logger.withCorrelation(...args);
    },

    getContext(...args) {
      return logger.getContext(...args);
    },

    getMetrics(...args) {
      return logger.getMetrics(...args);
    },

    resetMetrics(...args) {
      return logger.resetMetrics?.(...args);
    },
  };
}

module.exports = {
  redactObject,
  redactStringValue,
  redactLogData,
  createSecureLogger,
  isSensitiveFieldName,
  matchesSecretPattern,
  SENSITIVE_FIELD_NAMES,
  SECRET_PATTERNS,
  REDACTED,
};

// CommonJS/ESM interop
module.exports.default = module.exports;
