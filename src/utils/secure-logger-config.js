'use strict';

/**
 * Secure Logger Configuration Loader
 *
 * Loads and applies redaction pattern configurations from JSON files
 * or JavaScript objects to create configured SecureLogger instances.
 *
 * @module secure-logger-config
 * @since 2.2.5
 */

const fs = require('fs');
const path = require('path');
const { SecureLogger } = require('./secure-logger');

/**
 * Load configuration from JSON file
 *
 * @param {string} configPath - Path to configuration file
 * @returns {Object} Configuration object
 * @throws {Error} If file cannot be read or parsed
 *
 * @private
 */
function loadConfigFile(configPath) {
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Failed to load redaction config from ${configPath}: ${error.message}`,
    );
  }
}

/**
 * Convert regex string to RegExp object
 *
 * @param {string} regexStr - Regex pattern as string
 * @param {string} flags - Regex flags
 * @returns {RegExp} Compiled regular expression
 *
 * @private
 */
function compileRegex(regexStr, flags = 'g') {
  try {
    return new RegExp(regexStr, flags);
  } catch (error) {
    throw new Error(`Invalid regex pattern: ${regexStr} - ${error.message}`);
  }
}

/**
 * Apply environment-specific configuration overrides
 *
 * @param {Object} config - Base configuration
 * @param {string} [environment] - Environment name (defaults to NODE_ENV)
 * @returns {Object} Configuration with environment overrides applied
 *
 * @private
 */
function applyEnvironmentOverrides(config, environment) {
  const env = environment || process.env.NODE_ENV || 'development';

  if (config.environments && config.environments[env]) {
    return {
      ...config,
      ...config.environments[env],
    };
  }

  return config;
}

/**
 * Convert custom pattern configuration to SecureLogger format
 *
 * @param {Object} customPatterns - Custom patterns from config
 * @returns {Object} Patterns in SecureLogger format
 *
 * @private
 */
function convertCustomPatterns(customPatterns) {
  const converted = {};

  for (const [name, pattern] of Object.entries(customPatterns)) {
    converted[name] = {
      regex: compileRegex(pattern.regex, pattern.flags || 'g'),
      replacement: pattern.replacement,
      description: pattern.description || '',
      enabled: pattern.enabled !== false,
    };
  }

  return converted;
}

/**
 * Create SecureLogger from configuration
 *
 * @param {Object|string} config - Configuration object or path to config file
 * @param {string} [environment] - Environment name for overrides
 * @returns {SecureLogger} Configured SecureLogger instance
 *
 * @example
 * // Load from file
 * const logger = createLoggerFromConfig('./redaction-config.json');
 *
 * // Load from object
 * const logger = createLoggerFromConfig({
 *   enabled: true,
 *   redactEmails: true,
 *   customPatterns: {
 *     myPattern: {
 *       regex: '\\bMY-[A-Z0-9]+\\b',
 *       replacement: '[MY_TOKEN]'
 *     }
 *   }
 * });
 *
 * // Load with environment override
 * const logger = createLoggerFromConfig(config, 'production');
 */
function createLoggerFromConfig(config, environment) {
  let configuration;

  // Load from file if string path provided
  if (typeof config === 'string') {
    configuration = loadConfigFile(config);
  } else {
    configuration = config;
  }

  // Apply environment-specific overrides
  configuration = applyEnvironmentOverrides(configuration, environment);

  // Build SecureLogger options
  const options = {
    enabled: configuration.enabled !== false,
    trackStats: configuration.trackStats !== false,
    redactionMarker: configuration.redactionMarker,
    redactEmails: configuration.redactEmails || false,
    redactIPs: configuration.redactIPs || false,
  };

  // Add custom patterns
  if (configuration.customPatterns) {
    options.patterns = convertCustomPatterns(configuration.customPatterns);
  }

  // Add sensitive fields
  if (
    configuration.sensitiveFields &&
    Array.isArray(configuration.sensitiveFields)
  ) {
    options.sensitiveFields = configuration.sensitiveFields;
  }

  // Create logger instance
  const logger = new SecureLogger(options);

  // Handle enabled/disabled patterns
  if (
    configuration.disabledPatterns &&
    Array.isArray(configuration.disabledPatterns)
  ) {
    configuration.disabledPatterns.forEach((patternName) => {
      logger.removePattern(patternName);
    });
  }

  if (
    configuration.enabledPatterns &&
    Array.isArray(configuration.enabledPatterns)
  ) {
    // If specific patterns are listed, disable all others
    const activePatterns = logger.getActivePatterns();
    activePatterns.forEach((pattern) => {
      if (!configuration.enabledPatterns.includes(pattern.name)) {
        logger.removePattern(pattern.name);
      }
    });
  }

  return logger;
}

/**
 * Load default configuration
 *
 * Attempts to load configuration from default locations:
 * 1. ./redaction-config.json (current directory)
 * 2. ./config/redaction-patterns.json
 * 3. src/config/redaction-patterns.json
 *
 * @param {string} [environment] - Environment name for overrides
 * @returns {SecureLogger} Configured logger or default logger if no config found
 *
 * @example
 * const logger = loadDefaultConfig();
 * const prodLogger = loadDefaultConfig('production');
 */
function loadDefaultConfig(environment) {
  const defaultPaths = [
    path.join(process.cwd(), 'redaction-config.json'),
    path.join(process.cwd(), 'config', 'redaction-patterns.json'),
    path.join(__dirname, '..', 'config', 'redaction-patterns.json'),
  ];

  for (const configPath of defaultPaths) {
    if (fs.existsSync(configPath)) {
      try {
        return createLoggerFromConfig(configPath, environment);
      } catch (error) {
        console.warn(
          `Failed to load config from ${configPath}:`,
          error.message,
        );
      }
    }
  }

  // Return default logger if no config found
  return new SecureLogger();
}

/**
 * Validate configuration against schema
 *
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 *
 * @example
 * const result = validateConfig(myConfig);
 * if (!result.valid) {
 *   console.error('Config errors:', result.errors);
 * }
 */
function validateConfig(config) {
  const errors = [];

  // Check required fields
  if (config.enabled !== undefined && typeof config.enabled !== 'boolean') {
    errors.push('enabled must be a boolean');
  }

  if (
    config.trackStats !== undefined &&
    typeof config.trackStats !== 'boolean'
  ) {
    errors.push('trackStats must be a boolean');
  }

  if (
    config.redactionMarker !== undefined &&
    typeof config.redactionMarker !== 'string'
  ) {
    errors.push('redactionMarker must be a string');
  }

  // Validate custom patterns
  if (config.customPatterns && typeof config.customPatterns === 'object') {
    for (const [name, pattern] of Object.entries(config.customPatterns)) {
      if (!pattern.regex) {
        errors.push(`Custom pattern '${name}' missing regex field`);
      }
      if (!pattern.replacement) {
        errors.push(`Custom pattern '${name}' missing replacement field`);
      }

      // Try to compile regex
      if (pattern.regex) {
        try {
          compileRegex(pattern.regex, pattern.flags || 'g');
        } catch (error) {
          errors.push(
            `Custom pattern '${name}' has invalid regex: ${error.message}`,
          );
        }
      }
    }
  }

  // Validate sensitive fields
  if (config.sensitiveFields !== undefined) {
    if (!Array.isArray(config.sensitiveFields)) {
      errors.push('sensitiveFields must be an array');
    } else {
      config.sensitiveFields.forEach((field, index) => {
        if (typeof field !== 'string') {
          errors.push(`sensitiveFields[${index}] must be a string`);
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create configuration template
 *
 * @returns {Object} Template configuration object
 *
 * @example
 * const template = createConfigTemplate();
 * // Modify template as needed
 * const logger = createLoggerFromConfig(template);
 */
function createConfigTemplate() {
  return {
    enabled: true,
    trackStats: true,
    redactionMarker: '[REDACTED]',
    redactEmails: false,
    redactIPs: false,
    customPatterns: {},
    sensitiveFields: [],
    disabledPatterns: [],
    enabledPatterns: [],
    environments: {
      development: {
        enabled: false,
        trackStats: false,
      },
      production: {
        enabled: true,
        trackStats: true,
        redactEmails: true,
        redactIPs: true,
      },
      test: {
        enabled: false,
      },
    },
  };
}

module.exports = {
  createLoggerFromConfig,
  loadDefaultConfig,
  validateConfig,
  createConfigTemplate,
  loadConfigFile,
  compileRegex,
  applyEnvironmentOverrides,
  convertCustomPatterns,
};
