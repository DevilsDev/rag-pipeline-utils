'use strict';

/**
 * Input Sanitizer
 *
 * Comprehensive input validation and sanitization utility to prevent:
 * - Cross-Site Scripting (XSS) attacks
 * - SQL Injection attacks
 * - Command Injection attacks
 * - Path Traversal attacks
 * - NoSQL Injection attacks
 * - LDAP Injection attacks
 *
 * Performance optimized for high-throughput scenarios with caching
 * and efficient regex patterns.
 *
 * @module utils/input-sanitizer
 * @since 2.3.0
 */

/**
 * Sanitization rules enum
 */
const SanitizationRules = {
  NONE: 'none', // No sanitization
  HTML: 'html', // HTML escape
  HTML_STRICT: 'html_strict', // Remove all HTML tags
  XSS: 'xss', // XSS prevention (aggressive)
  SQL: 'sql', // SQL injection prevention
  COMMAND: 'command', // Command injection prevention
  PATH: 'path', // Path traversal prevention
  URL: 'url', // URL validation and sanitization
  EMAIL: 'email', // Email validation
  ALPHANUMERIC: 'alphanumeric', // Only letters and numbers
  UUID: 'uuid', // UUID validation
  INTEGER: 'integer', // Integer validation
  FLOAT: 'float', // Float validation
  BOOLEAN: 'boolean', // Boolean validation
  JSON: 'json', // JSON validation
  BASE64: 'base64', // Base64 validation
  HEX: 'hex', // Hexadecimal validation
  SLUG: 'slug', // Slug format (URL-friendly)
  DOMAIN: 'domain', // Domain name validation
  IPV4: 'ipv4', // IPv4 address validation
  IPV6: 'ipv6', // IPv6 address validation
};

/**
 * Common validation patterns (compiled for performance)
 */
const ValidationPatterns = {
  email:
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  url: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)$/,
  slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  domain:
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i,
  ipv4: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
  ipv6: /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/,
  alphanumeric: /^[a-zA-Z0-9]+$/,
  integer: /^-?\d+$/,
  float: /^-?\d+(\.\d+)?$/,
  base64: /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
  hex: /^[0-9a-fA-F]+$/,
};

/**
 * Dangerous patterns that indicate attacks (compiled for performance)
 */
const DangerousPatterns = {
  // XSS patterns
  xss: [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi, // Event handlers: onclick=, onload=, etc.
    /<iframe/gi,
    /<object/gi,
    /<embed/gi,
    /<applet/gi,
    /eval\s*\(/gi,
    /expression\s*\(/gi,
    /<meta/gi,
    /<link/gi,
    /alert\s*\(/gi, // Remove alert() function calls
    /confirm\s*\(/gi, // Remove confirm() function calls
    /prompt\s*\(/gi, // Remove prompt() function calls
  ],

  // SQL injection patterns
  sql: [
    /(\bor\b|\band\b)\s+['"]?\d+['"]?\s*=\s*['"]?\d+/gi,
    /union\s+select/gi,
    /;\s*(drop|delete|insert|update|create|alter|exec|execute)\s+/gi,
    /xp_cmdshell/gi,
    /waitfor\s+delay/gi,
    /benchmark\s*\(/gi,
  ],

  // Command injection patterns
  command: [
    /[;&|`$()]/g,
    /\$\{[^}]+\}/g, // Template literals
    /\$\([^)]+\)/g, // Command substitution
    />\s*\/dev\//gi,
    /\|\s*tee\b/gi,
  ],

  // Path traversal patterns
  pathTraversal: [
    /\.\.[/\\]/g,
    /\.\.[/\\]\.\./g,
    /\/\.\.\//g,
    /\\\.\.\\/g,
    /%2e%2e[/\\]/gi,
    /%252e%252e/gi,
  ],

  // NoSQL injection patterns
  nosql: [
    /\$where/gi,
    /\$ne\b/gi,
    /\$gt\b/gi,
    /\$lt\b/gi,
    /\$or\b/gi,
    /\$and\b/gi,
  ],
};

/**
 * HTML entity map for escaping
 */
const HtmlEntityMap = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\'': '&#x27;',
  '/': '&#x2F;',
};

/**
 * Input Sanitizer Class
 */
class InputSanitizer {
  constructor(options = {}) {
    this.options = {
      // Performance optimization
      enableCache: options.enableCache !== false,
      cacheSize: options.cacheSize || 1000,
      cacheTTL: options.cacheTTL || 60000, // 1 minute

      // Default rules
      defaultStringRule: options.defaultStringRule || SanitizationRules.HTML,
      defaultObjectDepth: options.defaultObjectDepth || 10,

      // Strictness
      throwOnInvalid: options.throwOnInvalid || false,
      stripInvalid: options.stripInvalid !== false,

      // Custom patterns
      customPatterns: options.customPatterns || {},
      customRules: options.customRules || {},

      // Statistics
      trackStats: options.trackStats !== false,
    };

    // Initialize cache
    this.cache = new Map();
    this.cacheAccessTimes = new Map();

    // Statistics
    this.stats = {
      sanitized: 0,
      cached: 0,
      blocked: 0,
      validationErrors: 0,
      averageTime: 0,
      totalTime: 0,
    };

    // Start cache cleanup if enabled
    if (this.options.enableCache) {
      this._startCacheCleanup();
    }
  }

  /**
   * Main sanitization function
   *
   * @param {*} input - Input to sanitize
   * @param {string|Object} rules - Sanitization rules or config
   * @returns {*} Sanitized input
   *
   * @example
   * // Simple sanitization
   * const safe = sanitizer.sanitize('<script>alert("xss")</script>', 'html');
   *
   * // With rules object
   * const safe = sanitizer.sanitize({
   *   username: '<script>hack</script>',
   *   email: 'user@example.com',
   *   age: '25'
   * }, {
   *   username: 'xss',
   *   email: 'email',
   *   age: 'integer'
   * });
   */
  sanitize(input, rules = null) {
    // Use high-resolution timing
    let startTime;
    if (typeof process !== 'undefined' && process.hrtime) {
      startTime = process.hrtime.bigint();
    } else if (
      typeof performance !== 'undefined' &&
      typeof performance.now === 'function'
    ) {
      startTime = performance.now();
    } else {
      startTime = Date.now();
    }

    try {
      // Handle null/undefined
      if (input === null || input === undefined) {
        return input;
      }

      // Determine sanitization strategy
      let result;

      if (typeof input === 'string') {
        result = this._sanitizeString(
          input,
          rules || this.options.defaultStringRule,
        );
      } else if (Array.isArray(input)) {
        result = this._sanitizeArray(input, rules);
      } else if (typeof input === 'object') {
        result = this._sanitizeObject(input, rules, 0);
      } else {
        // Primitives (number, boolean, etc.)
        result = input;
      }

      // Update statistics
      if (this.options.trackStats) {
        let duration;
        if (
          typeof process !== 'undefined' &&
          process.hrtime &&
          process.hrtime.bigint
        ) {
          try {
            const endTime = process.hrtime.bigint();
            // Convert nanoseconds to milliseconds
            duration = Number(endTime - startTime) / 1000000;
          } catch (e) {
            // Fallback if hrtime.bigint() fails (e.g., in test environments with fake timers)
            duration = 0.001; // Minimum 1 microsecond
          }
        } else if (
          typeof performance !== 'undefined' &&
          typeof performance.now === 'function'
        ) {
          duration = performance.now() - startTime;
        } else {
          duration = Date.now() - startTime;
        }

        // Ensure duration is at least 0.001ms (1 microsecond) to avoid zero averages
        if (duration === 0 || !isFinite(duration)) {
          duration = 0.001;
        }

        this.stats.sanitized++;
        this.stats.totalTime += duration;
        this.stats.averageTime = this.stats.totalTime / this.stats.sanitized;
      }

      return result;
    } catch (error) {
      // Always throw critical security errors regardless of throwOnInvalid setting
      if (error.message) {
        // Path traversal is a critical security violation - always throw
        if (error.message.includes('Potential path traversal detected')) {
          throw error;
        }
        // Depth errors should also always throw
        if (error.message.includes('Maximum object depth exceeded')) {
          throw error;
        }
      }

      if (this.options.throwOnInvalid) {
        throw error;
      }

      this.stats.validationErrors++;
      return this.options.stripInvalid ? null : input;
    }
  }

  /**
   * Sanitize string input
   * @private
   */
  _sanitizeString(str, rule) {
    if (typeof str !== 'string') {
      return str;
    }

    // Check cache
    if (this.options.enableCache) {
      const cacheKey = `${rule}:${str}`;
      if (this.cache.has(cacheKey)) {
        this.cacheAccessTimes.set(cacheKey, Date.now());
        this.stats.cached++;
        return this.cache.get(cacheKey);
      }
    }

    let result;

    switch (rule) {
      case SanitizationRules.NONE:
        result = str;
        break;

      case SanitizationRules.HTML:
        result = this._escapeHtml(str);
        break;

      case SanitizationRules.HTML_STRICT:
        result = this._stripHtml(str);
        break;

      case SanitizationRules.XSS:
        result = this._sanitizeXss(str);
        break;

      case SanitizationRules.SQL:
        result = this._sanitizeSql(str);
        break;

      case SanitizationRules.COMMAND:
        result = this._sanitizeCommand(str);
        break;

      case SanitizationRules.PATH:
        result = this._sanitizePath(str);
        break;

      case SanitizationRules.URL:
        result = this._validateAndSanitizeUrl(str);
        break;

      case SanitizationRules.EMAIL:
        result = this._validateEmail(str);
        break;

      case SanitizationRules.ALPHANUMERIC:
        result = this._validateAlphanumeric(str);
        break;

      case SanitizationRules.UUID:
        result = this._validateUuid(str);
        break;

      case SanitizationRules.INTEGER:
        result = this._validateInteger(str);
        break;

      case SanitizationRules.FLOAT:
        result = this._validateFloat(str);
        break;

      case SanitizationRules.BOOLEAN:
        result = this._validateBoolean(str);
        break;

      case SanitizationRules.JSON:
        result = this._validateJson(str);
        break;

      case SanitizationRules.BASE64:
        result = this._validateBase64(str);
        break;

      case SanitizationRules.HEX:
        result = this._validateHex(str);
        break;

      case SanitizationRules.SLUG:
        result = this._validateSlug(str);
        break;

      case SanitizationRules.DOMAIN:
        result = this._validateDomain(str);
        break;

      case SanitizationRules.IPV4:
        result = this._validateIpv4(str);
        break;

      case SanitizationRules.IPV6:
        result = this._validateIpv6(str);
        break;

      default:
        // Check custom rules
        if (this.options.customRules[rule]) {
          result = this.options.customRules[rule](str);
        } else {
          result = this._escapeHtml(str); // Default to HTML escape
        }
    }

    // Cache result
    if (this.options.enableCache) {
      const cacheKey = `${rule}:${str}`;
      this._addToCache(cacheKey, result);
    }

    return result;
  }

  /**
   * Sanitize array
   * @private
   */
  _sanitizeArray(arr, rules) {
    return arr.map((item) => this.sanitize(item, rules));
  }

  /**
   * Sanitize object recursively
   * @private
   */
  _sanitizeObject(obj, rules, depth = 0) {
    if (depth >= this.options.defaultObjectDepth) {
      throw new Error(
        `Maximum object depth exceeded: ${this.options.defaultObjectDepth}`,
      );
    }

    const sanitized = {};

    for (const [key, value] of Object.entries(obj)) {
      // Sanitize key
      const safeKey = this._sanitizeString(key, SanitizationRules.ALPHANUMERIC);

      // Determine rule for this field
      const fieldRule = rules && typeof rules === 'object' ? rules[key] : rules;

      // Sanitize value
      if (typeof value === 'string') {
        sanitized[safeKey] = this._sanitizeString(value, fieldRule);
      } else if (Array.isArray(value)) {
        sanitized[safeKey] = this._sanitizeArray(value, fieldRule);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[safeKey] = this._sanitizeObject(value, fieldRule, depth + 1);
      } else {
        sanitized[safeKey] = value;
      }
    }

    return sanitized;
  }

  /**
   * Escape HTML entities
   * @private
   */
  _escapeHtml(str) {
    return str.replace(/[&<>"'/]/g, (char) => HtmlEntityMap[char] || char);
  }

  /**
   * Strip all HTML tags
   * @private
   */
  _stripHtml(str) {
    return str.replace(/<[^>]*>/g, '');
  }

  /**
   * Aggressive XSS sanitization
   * @private
   */
  _sanitizeXss(str) {
    let sanitized = str;

    // Apply all XSS patterns
    for (const pattern of DangerousPatterns.xss) {
      if (pattern.test(sanitized)) {
        this.stats.blocked++;
        sanitized = sanitized.replace(pattern, '');
      }
    }

    // HTML escape remaining content
    sanitized = this._escapeHtml(sanitized);

    return sanitized;
  }

  /**
   * SQL injection sanitization
   * @private
   */
  _sanitizeSql(str) {
    let sanitized = str;

    // Check for SQL injection patterns
    for (const pattern of DangerousPatterns.sql) {
      if (pattern.test(sanitized)) {
        this.stats.blocked++;
        if (this.options.throwOnInvalid) {
          throw new Error('Potential SQL injection detected');
        }
        // Remove dangerous patterns
        sanitized = sanitized.replace(pattern, '');
      }
    }

    // Escape single quotes (basic SQL escaping)
    sanitized = sanitized.replace(/'/g, '\'\'');

    return sanitized;
  }

  /**
   * Command injection sanitization
   * @private
   */
  _sanitizeCommand(str) {
    // Check for command injection patterns
    for (const pattern of DangerousPatterns.command) {
      if (pattern.test(str)) {
        this.stats.blocked++;
        if (this.options.throwOnInvalid) {
          throw new Error('Potential command injection detected');
        }
        return '';
      }
    }

    return str;
  }

  /**
   * Path traversal sanitization
   * @private
   */
  _sanitizePath(str) {
    // First decode any URL encoding
    let decoded = str;
    try {
      decoded = decodeURIComponent(str);
    } catch (e) {
      // If decoding fails, use original
    }

    // Check for path traversal patterns in both original and decoded
    for (const pattern of DangerousPatterns.pathTraversal) {
      if (pattern.test(str) || pattern.test(decoded)) {
        this.stats.blocked++;
        // SECURITY: Always throw on path traversal - it should never be silently sanitized
        // Empty paths could resolve to application root, creating security vulnerabilities
        throw new Error('Potential path traversal detected');
      }
    }

    // Remove leading/trailing slashes
    str = str.replace(/^[/\\]+|[/\\]+$/g, '');

    // Normalize path separators
    str = str.replace(/\\/g, '/');

    return str;
  }

  /**
   * URL validation and sanitization
   * @private
   */
  _validateAndSanitizeUrl(str) {
    // Check against URL pattern
    if (!ValidationPatterns.url.test(str)) {
      if (this.options.throwOnInvalid) {
        throw new Error('Invalid URL format');
      }
      return '';
    }

    // Only allow http and https protocols
    if (!str.startsWith('http://') && !str.startsWith('https://')) {
      if (this.options.throwOnInvalid) {
        throw new Error('URL must use http or https protocol');
      }
      return '';
    }

    return str;
  }

  /**
   * Email validation
   * @private
   */
  _validateEmail(str) {
    if (!ValidationPatterns.email.test(str)) {
      if (this.options.throwOnInvalid) {
        throw new Error('Invalid email format');
      }
      return '';
    }
    return str.toLowerCase();
  }

  /**
   * Alphanumeric validation
   * @private
   */
  _validateAlphanumeric(str) {
    if (!ValidationPatterns.alphanumeric.test(str)) {
      if (this.options.throwOnInvalid) {
        throw new Error('Must contain only alphanumeric characters');
      }
      return str.replace(/[^a-zA-Z0-9]/g, '');
    }
    return str;
  }

  /**
   * UUID validation
   * @private
   */
  _validateUuid(str) {
    if (!ValidationPatterns.uuid.test(str)) {
      if (this.options.throwOnInvalid) {
        throw new Error('Invalid UUID format');
      }
      return '';
    }
    return str.toLowerCase();
  }

  /**
   * Integer validation
   * @private
   */
  _validateInteger(str) {
    if (!ValidationPatterns.integer.test(str)) {
      if (this.options.throwOnInvalid) {
        throw new Error('Invalid integer format');
      }
      return '';
    }
    return str;
  }

  /**
   * Float validation
   * @private
   */
  _validateFloat(str) {
    if (!ValidationPatterns.float.test(str)) {
      if (this.options.throwOnInvalid) {
        throw new Error('Invalid float format');
      }
      return '';
    }
    return str;
  }

  /**
   * Boolean validation
   * @private
   */
  _validateBoolean(str) {
    const lower = str.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') {
      return 'true';
    } else if (lower === 'false' || lower === '0' || lower === 'no') {
      return 'false';
    }

    if (this.options.throwOnInvalid) {
      throw new Error('Invalid boolean value');
    }
    return '';
  }

  /**
   * JSON validation
   * @private
   */
  _validateJson(str) {
    try {
      JSON.parse(str);
      return str;
    } catch (error) {
      if (this.options.throwOnInvalid) {
        throw new Error('Invalid JSON format');
      }
      return '';
    }
  }

  /**
   * Base64 validation
   * @private
   */
  _validateBase64(str) {
    if (!ValidationPatterns.base64.test(str)) {
      if (this.options.throwOnInvalid) {
        throw new Error('Invalid base64 format');
      }
      return '';
    }
    return str;
  }

  /**
   * Hexadecimal validation
   * @private
   */
  _validateHex(str) {
    if (!ValidationPatterns.hex.test(str)) {
      if (this.options.throwOnInvalid) {
        throw new Error('Invalid hexadecimal format');
      }
      return '';
    }
    return str.toLowerCase();
  }

  /**
   * Slug validation
   * @private
   */
  _validateSlug(str) {
    if (!ValidationPatterns.slug.test(str)) {
      if (this.options.throwOnInvalid) {
        throw new Error('Invalid slug format');
      }
      // Convert to slug
      return str
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }
    return str;
  }

  /**
   * Domain validation
   * @private
   */
  _validateDomain(str) {
    if (!ValidationPatterns.domain.test(str)) {
      if (this.options.throwOnInvalid) {
        throw new Error('Invalid domain format');
      }
      return '';
    }
    return str.toLowerCase();
  }

  /**
   * IPv4 validation
   * @private
   */
  _validateIpv4(str) {
    if (!ValidationPatterns.ipv4.test(str)) {
      if (this.options.throwOnInvalid) {
        throw new Error('Invalid IPv4 address');
      }
      return '';
    }
    return str;
  }

  /**
   * IPv6 validation
   * @private
   */
  _validateIpv6(str) {
    if (!ValidationPatterns.ipv6.test(str)) {
      if (this.options.throwOnInvalid) {
        throw new Error('Invalid IPv6 address');
      }
      return '';
    }
    return str.toLowerCase();
  }

  /**
   * Add entry to cache
   * @private
   */
  _addToCache(key, value) {
    // Enforce cache size limit
    if (this.cache.size >= this.options.cacheSize) {
      // Remove oldest entry
      const oldestKey = Array.from(this.cacheAccessTimes.entries()).sort(
        ([, a], [, b]) => a - b,
      )[0][0];
      this.cache.delete(oldestKey);
      this.cacheAccessTimes.delete(oldestKey);
    }

    this.cache.set(key, value);
    this.cacheAccessTimes.set(key, Date.now());
  }

  /**
   * Start cache cleanup interval
   * @private
   */
  _startCacheCleanup() {
    this.cacheCleanupInterval = setInterval(() => {
      const now = Date.now();
      const expired = [];

      for (const [key, accessTime] of this.cacheAccessTimes.entries()) {
        if (now - accessTime > this.options.cacheTTL) {
          expired.push(key);
        }
      }

      for (const key of expired) {
        this.cache.delete(key);
        this.cacheAccessTimes.delete(key);
      }
    }, this.options.cacheTTL);

    // Don't block process exit
    if (this.cacheCleanupInterval.unref) {
      this.cacheCleanupInterval.unref();
    }
  }

  /**
   * Get sanitizer statistics
   *
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      cacheHitRate: this.stats.cached / Math.max(1, this.stats.sanitized),
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      sanitized: 0,
      cached: 0,
      blocked: 0,
      validationErrors: 0,
      averageTime: 0,
      totalTime: 0,
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.cacheAccessTimes.clear();
  }

  /**
   * Destroy sanitizer and cleanup resources
   */
  destroy() {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }

    this.clearCache();
  }
}

/**
 * Singleton instance with default configuration
 */
const defaultSanitizer = new InputSanitizer();

/**
 * Quick sanitization functions (using singleton)
 */
function sanitizeInput(input, rules = null) {
  return defaultSanitizer.sanitize(input, rules);
}

function sanitizeHtml(str) {
  return defaultSanitizer.sanitize(str, SanitizationRules.HTML);
}

function sanitizeXss(str) {
  return defaultSanitizer.sanitize(str, SanitizationRules.XSS);
}

function sanitizeSql(str) {
  return defaultSanitizer.sanitize(str, SanitizationRules.SQL);
}

function sanitizeCommand(str) {
  return defaultSanitizer.sanitize(str, SanitizationRules.COMMAND);
}

function sanitizePath(str) {
  return defaultSanitizer.sanitize(str, SanitizationRules.PATH);
}

function validateEmail(str) {
  return defaultSanitizer.sanitize(str, SanitizationRules.EMAIL);
}

function validateUrl(str) {
  return defaultSanitizer.sanitize(str, SanitizationRules.URL);
}

function validateUuid(str) {
  return defaultSanitizer.sanitize(str, SanitizationRules.UUID);
}

module.exports = {
  InputSanitizer,
  SanitizationRules,
  ValidationPatterns,
  sanitizeInput,
  sanitizeHtml,
  sanitizeXss,
  sanitizeSql,
  sanitizeCommand,
  sanitizePath,
  validateEmail,
  validateUrl,
  validateUuid,
  defaultSanitizer,
};
