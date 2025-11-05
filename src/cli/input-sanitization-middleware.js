"use strict";

/**
 * CLI Input Sanitization Middleware
 *
 * Provides automatic input sanitization for CLI commands to prevent:
 * - Command injection attacks
 * - Path traversal attacks
 * - XSS in output
 * - Invalid data types
 *
 * @module cli/input-sanitization-middleware
 * @since 2.3.0
 */

const {
  InputSanitizer,
  SanitizationRules,
  sanitizePath,
  sanitizeCommand,
  validateEmail,
  validateUrl,
} = require("../utils/input-sanitizer");

/**
 * CLI-specific sanitization rules mapping
 */
const CLI_SANITIZATION_RULES = {
  // File and path arguments
  file: SanitizationRules.PATH,
  path: SanitizationRules.PATH,
  output: SanitizationRules.PATH,
  input: SanitizationRules.PATH,
  config: SanitizationRules.PATH,
  report: SanitizationRules.PATH,

  // URL arguments
  url: SanitizationRules.URL,

  // Email arguments
  email: SanitizationRules.EMAIL,

  // String arguments (prompts, queries, templates)
  prompt: SanitizationRules.XSS,
  query: SanitizationRules.XSS,
  template: SanitizationRules.ALPHANUMERIC,

  // Configuration keys
  key: SanitizationRules.ALPHANUMERIC,
  name: SanitizationRules.SLUG,

  // Numeric arguments
  timeout: SanitizationRules.INTEGER,
  concurrency: SanitizationRules.INTEGER,
  batchSize: SanitizationRules.INTEGER,
  maxMemory: SanitizationRules.INTEGER,

  // Categories and sections
  category: SanitizationRules.SLUG,
  section: SanitizationRules.SLUG,
  format: SanitizationRules.SLUG,
};

/**
 * CLI Input Sanitization Middleware
 */
class CLISanitizationMiddleware {
  constructor(options = {}) {
    this.sanitizer = new InputSanitizer({
      enableCache: options.enableCache !== false,
      cacheSize: options.cacheSize || 500,
      cacheTTL: options.cacheTTL || 300000, // 5 minutes
      throwOnInvalid: options.throwOnInvalid || false,
      stripInvalid: options.stripInvalid !== false,
      trackStats: options.trackStats !== false,
    });

    this.customRules = options.customRules || {};
    this.enabled = options.enabled !== false;
    this.verbose = options.verbose || false;
  }

  /**
   * Sanitize command arguments
   *
   * @param {Object} args - Command arguments object
   * @returns {Object} Sanitized arguments
   *
   * @example
   * const sanitized = middleware.sanitizeArgs({
   *   file: '../../../etc/passwd',
   *   query: '<script>alert("xss")</script>',
   *   timeout: '1000'
   * });
   */
  sanitizeArgs(args) {
    if (!this.enabled) {
      return args;
    }

    if (!args || typeof args !== "object") {
      return args;
    }

    const sanitized = {};

    for (const [key, value] of Object.entries(args)) {
      // Skip undefined/null values
      if (value === undefined || value === null) {
        sanitized[key] = value;
        continue;
      }

      // Determine sanitization rule for this argument
      const rule = this._getRuleForArgument(key, value);

      // Sanitize the value
      try {
        sanitized[key] = this.sanitizer.sanitize(value, rule);

        // Log if value was modified (in verbose mode)
        if (this.verbose && sanitized[key] !== value) {
          console.warn(
            `[INPUT_SANITIZER] Sanitized argument '${key}': ${value} => ${sanitized[key]}`,
          );
        }
      } catch (error) {
        console.error(
          `[INPUT_SANITIZER] Error sanitizing argument '${key}':`,
          error.message,
        );
        sanitized[key] = value; // Fall back to original value
      }
    }

    return sanitized;
  }

  /**
   * Sanitize command options
   *
   * @param {Object} options - Command options object
   * @returns {Object} Sanitized options
   */
  sanitizeOptions(options) {
    return this.sanitizeArgs(options);
  }

  /**
   * Sanitize command output before displaying
   *
   * @param {string} output - Command output string
   * @returns {string} Sanitized output
   */
  sanitizeOutput(output) {
    if (!this.enabled) {
      return output;
    }

    if (typeof output !== "string") {
      return output;
    }

    // HTML escape for terminal output (prevents potential terminal injection)
    return this.sanitizer.sanitize(output, SanitizationRules.HTML);
  }

  /**
   * Wrap command action with sanitization
   *
   * @param {Function} action - Original command action
   * @returns {Function} Wrapped action with sanitization
   *
   * @example
   * const wrappedAction = middleware.wrapAction(async (options) => {
   *   // Original action
   * });
   */
  wrapAction(action) {
    return async (...args) => {
      // Last argument is typically options object
      const lastArg = args[args.length - 1];

      if (lastArg && typeof lastArg === "object") {
        // Sanitize options
        args[args.length - 1] = this.sanitizeOptions(lastArg);
      }

      // Sanitize positional arguments
      for (let i = 0; i < args.length - 1; i++) {
        if (typeof args[i] === "string") {
          args[i] = this.sanitizer.sanitize(args[i], SanitizationRules.HTML);
        }
      }

      // Execute original action
      return await action(...args);
    };
  }

  /**
   * Get sanitization rule for argument based on name and type
   * @private
   */
  _getRuleForArgument(argName, value) {
    // Check custom rules first
    if (this.customRules[argName]) {
      return this.customRules[argName];
    }

    // Check predefined CLI rules
    if (CLI_SANITIZATION_RULES[argName]) {
      return CLI_SANITIZATION_RULES[argName];
    }

    // Infer rule from argument name patterns
    if (
      argName.includes("path") ||
      argName.includes("file") ||
      argName.includes("dir")
    ) {
      return SanitizationRules.PATH;
    }

    if (argName.includes("url") || argName.includes("uri")) {
      return SanitizationRules.URL;
    }

    if (argName.includes("email")) {
      return SanitizationRules.EMAIL;
    }

    if (argName.includes("id") || argName.includes("uuid")) {
      return SanitizationRules.UUID;
    }

    // Infer from value type
    if (typeof value === "number" || /^\d+$/.test(value)) {
      return SanitizationRules.INTEGER;
    }

    if (typeof value === "boolean") {
      return SanitizationRules.BOOLEAN;
    }

    // Default to XSS sanitization for strings
    return SanitizationRules.XSS;
  }

  /**
   * Get sanitization statistics
   *
   * @returns {Object} Statistics object
   */
  getStats() {
    return this.sanitizer.getStats();
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.sanitizer.resetStats();
  }

  /**
   * Destroy middleware and cleanup resources
   */
  destroy() {
    this.sanitizer.destroy();
  }
}

/**
 * Create global CLI sanitization middleware instance
 */
const cliSanitizer = new CLISanitizationMiddleware({
  enabled: process.env.CLI_SANITIZATION !== "false",
  verbose: process.env.CLI_SANITIZATION_VERBOSE === "true",
});

/**
 * Quick sanitization helpers for CLI
 */
function sanitizeCliPath(pathStr) {
  return sanitizePath(pathStr);
}

function sanitizeCliCommand(cmdStr) {
  return sanitizeCommand(cmdStr);
}

function sanitizeCliQuery(queryStr) {
  return cliSanitizer.sanitizer.sanitize(queryStr, SanitizationRules.XSS);
}

function sanitizeCliEmail(emailStr) {
  return validateEmail(emailStr);
}

function sanitizeCliUrl(urlStr) {
  return validateUrl(urlStr);
}

/**
 * Sanitize file path for CLI operations
 *
 * @param {string} filePath - File path to sanitize
 * @returns {string} Sanitized file path
 */
function sanitizeFilePath(filePath) {
  if (!filePath || typeof filePath !== "string") {
    return filePath;
  }

  // Remove path traversal attempts
  let sanitized = filePath;

  // Remove leading traversal
  sanitized = sanitized.replace(/^(\.\.\/|\.\.\\)+/, "");

  // Remove embedded traversal
  sanitized = sanitized.replace(/\/(\.\.\/|\.\.\\)/g, "/");
  sanitized = sanitized.replace(/\\(\.\.\/|\.\.\\)/g, "\\");

  // Normalize path separators
  sanitized = sanitized.replace(/\\/g, "/");

  // Remove multiple consecutive slashes
  sanitized = sanitized.replace(/\/+/g, "/");

  return sanitized;
}

/**
 * Sanitize all CLI options at once
 *
 * @param {Object} options - CLI options object
 * @returns {Object} Sanitized options
 */
function sanitizeAllCliOptions(options) {
  return cliSanitizer.sanitizeOptions(options);
}

module.exports = {
  CLISanitizationMiddleware,
  cliSanitizer,
  sanitizeCliPath,
  sanitizeCliCommand,
  sanitizeCliQuery,
  sanitizeCliEmail,
  sanitizeCliUrl,
  sanitizeFilePath,
  sanitizeAllCliOptions,
  CLI_SANITIZATION_RULES,
};
