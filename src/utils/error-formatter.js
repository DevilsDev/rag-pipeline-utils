"use strict";

/**
 * Error Formatter Utility
 *
 * Provides enhanced error messages with actionable suggestions,
 * context, and documentation references.
 *
 * @module utils/error-formatter
 * @since 2.4.0
 */

/**
 * Error codes organized by category
 */
const ERROR_CODES = {
  // Configuration errors (CONFIG_*)
  CONFIG_NOT_FOUND: "CONFIG_NOT_FOUND",
  CONFIG_INVALID_JSON: "CONFIG_INVALID_JSON",
  CONFIG_VALIDATION_FAILED: "CONFIG_VALIDATION_FAILED",
  CONFIG_MISSING_REQUIRED: "CONFIG_MISSING_REQUIRED",
  CONFIG_INVALID_TYPE: "CONFIG_INVALID_TYPE",
  CONFIG_INVALID_VALUE: "CONFIG_INVALID_VALUE",

  // Plugin errors (PLUGIN_*)
  PLUGIN_NOT_FOUND: "PLUGIN_NOT_FOUND",
  PLUGIN_LOAD_FAILED: "PLUGIN_LOAD_FAILED",
  PLUGIN_INVALID_EXPORT: "PLUGIN_INVALID_EXPORT",
  PLUGIN_EXECUTION_FAILED: "PLUGIN_EXECUTION_FAILED",
  PLUGIN_INITIALIZATION_FAILED: "PLUGIN_INITIALIZATION_FAILED",
  PLUGIN_CONTRACT_VIOLATION: "PLUGIN_CONTRACT_VIOLATION",
  PLUGIN_DEPENDENCY_MISSING: "PLUGIN_DEPENDENCY_MISSING",

  // Pipeline errors (PIPELINE_*)
  PIPELINE_CREATION_FAILED: "PIPELINE_CREATION_FAILED",
  PIPELINE_EXECUTION_FAILED: "PIPELINE_EXECUTION_FAILED",
  PIPELINE_STAGE_FAILED: "PIPELINE_STAGE_FAILED",
  PIPELINE_INVALID_STAGE: "PIPELINE_INVALID_STAGE",

  // Validation errors (VALIDATION_*)
  VALIDATION_FAILED: "VALIDATION_FAILED",
  VALIDATION_SCHEMA_ERROR: "VALIDATION_SCHEMA_ERROR",
  VALIDATION_CONSTRAINT_ERROR: "VALIDATION_CONSTRAINT_ERROR",

  // File system errors (FS_*)
  FS_FILE_NOT_FOUND: "FS_FILE_NOT_FOUND",
  FS_DIRECTORY_NOT_FOUND: "FS_DIRECTORY_NOT_FOUND",
  FS_PERMISSION_DENIED: "FS_PERMISSION_DENIED",
  FS_READ_ERROR: "FS_READ_ERROR",
  FS_WRITE_ERROR: "FS_WRITE_ERROR",

  // Network errors (NETWORK_*)
  NETWORK_REQUEST_FAILED: "NETWORK_REQUEST_FAILED",
  NETWORK_TIMEOUT: "NETWORK_TIMEOUT",
  NETWORK_INVALID_RESPONSE: "NETWORK_INVALID_RESPONSE",

  // Hot reload errors (HOT_RELOAD_*)
  HOT_RELOAD_FAILED: "HOT_RELOAD_FAILED",
  HOT_RELOAD_STATE_ERROR: "HOT_RELOAD_STATE_ERROR",
  HOT_RELOAD_WATCH_ERROR: "HOT_RELOAD_WATCH_ERROR",

  // DAG errors (DAG_*)
  DAG_CYCLE_DETECTED: "DAG_CYCLE_DETECTED",
  DAG_NODE_NOT_FOUND: "DAG_NODE_NOT_FOUND",
  DAG_EXECUTION_FAILED: "DAG_EXECUTION_FAILED",
  DAG_INVALID_TOPOLOGY: "DAG_INVALID_TOPOLOGY",

  // Authentication/Authorization errors (AUTH_*)
  AUTH_INVALID_TOKEN: "AUTH_INVALID_TOKEN",
  AUTH_TOKEN_EXPIRED: "AUTH_TOKEN_EXPIRED",
  AUTH_INSUFFICIENT_PERMISSIONS: "AUTH_INSUFFICIENT_PERMISSIONS",

  // Generic errors
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
};

/**
 * Error message templates with suggestions
 */
const ERROR_TEMPLATES = {
  [ERROR_CODES.CONFIG_NOT_FOUND]: {
    message: "Configuration file not found at '{path}'",
    suggestions: [
      "Create a .ragrc.json file in the project root",
      "Specify the config path using --config flag",
      "Run 'rag-pipeline init' to create a default configuration",
    ],
    documentation: "configuration.md#getting-started",
  },

  [ERROR_CODES.CONFIG_INVALID_JSON]: {
    message: "Invalid JSON in configuration file '{path}'",
    suggestions: [
      "Validate JSON syntax using a JSON validator",
      "Check for missing commas, quotes, or brackets",
      "Use an IDE with JSON validation support",
      "Review the error details: {details}",
    ],
    documentation: "configuration.md#json-format",
  },

  [ERROR_CODES.CONFIG_VALIDATION_FAILED]: {
    message: "Configuration validation failed: {reason}",
    suggestions: [
      "Review the validation errors listed above",
      "Check the configuration schema documentation",
      "Ensure all required fields are present: {requiredFields}",
      "Validate configuration using: rag-pipeline validate",
    ],
    documentation: "configuration.md#schema-validation",
  },

  [ERROR_CODES.CONFIG_MISSING_REQUIRED]: {
    message: "Missing required configuration field: '{field}'",
    suggestions: [
      "Add the '{field}' field to your .ragrc.json",
      "Check the configuration examples in documentation",
      "Required type: {expectedType}",
    ],
    documentation: "configuration.md#required-fields",
  },

  [ERROR_CODES.CONFIG_INVALID_TYPE]: {
    message:
      "Invalid type for configuration field '{field}': expected {expected}, got {actual}",
    suggestions: [
      "Change '{field}' to type {expected}",
      "Review the configuration schema for correct types",
      "Current value: {currentValue}",
    ],
    documentation: "configuration.md#field-types",
  },

  [ERROR_CODES.PLUGIN_NOT_FOUND]: {
    message: "Plugin '{plugin}' not found",
    suggestions: [
      "Check if the plugin is installed: npm list {plugin}",
      "Install the plugin: npm install {plugin}",
      "Verify the plugin path in configuration: {path}",
      "Check for typos in the plugin name",
    ],
    documentation: "plugins.md#installation",
  },

  [ERROR_CODES.PLUGIN_LOAD_FAILED]: {
    message: "Failed to load plugin '{plugin}': {reason}",
    suggestions: [
      "Check if the plugin file exists at: {path}",
      "Verify the plugin exports a valid module",
      "Install plugin dependencies: npm install",
      "Review the plugin error: {details}",
    ],
    documentation: "plugins.md#troubleshooting",
  },

  [ERROR_CODES.PLUGIN_INVALID_EXPORT]: {
    message: "Plugin '{plugin}' does not export a valid structure",
    suggestions: [
      "Ensure the plugin exports a class or function",
      "Check that required methods are implemented: {requiredMethods}",
      "Review plugin contract documentation",
      "Example: module.exports = class MyPlugin { execute() {} }",
    ],
    documentation: "plugins.md#plugin-contract",
  },

  [ERROR_CODES.PLUGIN_EXECUTION_FAILED]: {
    message: "Plugin '{plugin}' execution failed: {reason}",
    suggestions: [
      "Check plugin input data matches expected format",
      "Review plugin error logs above",
      "Verify plugin dependencies are installed",
      "Try running plugin in isolation for debugging",
      "Input received: {input}",
    ],
    documentation: "plugins.md#debugging",
  },

  [ERROR_CODES.PLUGIN_CONTRACT_VIOLATION]: {
    message: "Plugin '{plugin}' violates contract: {violation}",
    suggestions: [
      "Implement required method: {missingMethod}",
      "Return expected type: {expectedType}",
      "Review plugin contract documentation",
      "Check plugin certification requirements",
    ],
    documentation: "plugins.md#contract-requirements",
  },

  [ERROR_CODES.PLUGIN_DEPENDENCY_MISSING]: {
    message: "Plugin '{plugin}' missing dependency: {dependency}",
    suggestions: [
      "Install missing dependency: npm install {dependency}",
      "Check plugin's package.json for required dependencies",
      "Verify dependency version compatibility: {requiredVersion}",
    ],
    documentation: "plugins.md#dependencies",
  },

  [ERROR_CODES.PIPELINE_CREATION_FAILED]: {
    message: "Failed to create pipeline: {reason}",
    suggestions: [
      "Verify configuration is valid: rag-pipeline validate",
      "Check all plugins are installed and accessible",
      "Review pipeline stages configuration",
      "Ensure all required stages are defined: {requiredStages}",
    ],
    documentation: "pipeline.md#creation",
  },

  [ERROR_CODES.PIPELINE_EXECUTION_FAILED]: {
    message: "Pipeline execution failed at stage '{stage}': {reason}",
    suggestions: [
      "Check input data format for stage '{stage}'",
      "Review plugin configuration for this stage",
      "Enable verbose logging: pipeline.execute({ verbose: true })",
      "Check previous stage outputs",
    ],
    documentation: "pipeline.md#execution-errors",
  },

  [ERROR_CODES.PIPELINE_STAGE_FAILED]: {
    message: "Stage '{stage}' failed: {reason}",
    suggestions: [
      "Verify stage configuration is correct",
      "Check stage dependencies are met",
      "Review stage plugin logs",
      "Input data: {input}",
    ],
    documentation: "pipeline.md#stage-configuration",
  },

  [ERROR_CODES.FS_FILE_NOT_FOUND]: {
    message: "File not found: {path}",
    suggestions: [
      "Verify the file path is correct: {path}",
      "Check file permissions and access rights",
      "Ensure the file has not been moved or deleted",
      "Use absolute path instead of relative path",
    ],
    documentation: "troubleshooting.md#file-errors",
  },

  [ERROR_CODES.FS_DIRECTORY_NOT_FOUND]: {
    message: "Directory not found: {path}",
    suggestions: [
      "Create the directory: mkdir -p {path}",
      "Verify the directory path is correct",
      "Check parent directory exists and is accessible",
    ],
    documentation: "troubleshooting.md#file-errors",
  },

  [ERROR_CODES.FS_PERMISSION_DENIED]: {
    message: "Permission denied accessing: {path}",
    suggestions: [
      "Check file/directory permissions: ls -la {path}",
      "Ensure your user has read/write access",
      "Try running with appropriate permissions",
      "Contact system administrator if needed",
    ],
    documentation: "troubleshooting.md#permission-errors",
  },

  [ERROR_CODES.HOT_RELOAD_FAILED]: {
    message: "Hot reload failed for '{path}': {reason}",
    suggestions: [
      "Check for syntax errors in the modified file",
      "Ensure the file is within watched paths: {watchPaths}",
      "Try manual reload: hotReload.triggerReload('{path}')",
      "Review error details above",
    ],
    documentation: "hot-reload.md#troubleshooting",
  },

  [ERROR_CODES.HOT_RELOAD_STATE_ERROR]: {
    message: "Failed to preserve/restore state during reload: {reason}",
    suggestions: [
      "Check that state is serializable (no functions, circular refs)",
      "Implement getState/setState methods in your plugin",
      "Disable state preservation if not needed: preserveState: false",
      "Review state preservation documentation",
    ],
    documentation: "hot-reload.md#state-preservation",
  },

  [ERROR_CODES.DAG_CYCLE_DETECTED]: {
    message: "Cycle detected in DAG: {cycle}",
    suggestions: [
      "Review the dependency chain: {cycle}",
      "Remove circular dependencies between nodes",
      "Ensure all edges form a directed acyclic graph",
      "Use topological sort to verify order",
    ],
    documentation: "dag.md#cycles",
  },

  [ERROR_CODES.DAG_NODE_NOT_FOUND]: {
    message: "DAG node '{node}' not found",
    suggestions: [
      "Check node ID is correct: {node}",
      "Verify node was added to DAG before execution",
      "List all nodes: dag.getNodes()",
      "Available nodes: {availableNodes}",
    ],
    documentation: "dag.md#nodes",
  },

  [ERROR_CODES.VALIDATION_FAILED]: {
    message: "Validation failed: {reason}",
    suggestions: [
      "Review validation errors: {errors}",
      "Check input data against schema",
      "Use validation tools to verify format",
    ],
    documentation: "validation.md",
  },

  [ERROR_CODES.AUTH_INVALID_TOKEN]: {
    message: "Invalid authentication token",
    suggestions: [
      "Check token format and signature",
      "Verify token hasn't been tampered with",
      "Ensure token is properly encoded",
      "Generate new token if needed",
    ],
    documentation: "security.md#authentication",
  },

  [ERROR_CODES.AUTH_TOKEN_EXPIRED]: {
    message: "Authentication token expired at {expiredAt}",
    suggestions: [
      "Generate a new authentication token",
      "Increase token expiration time in configuration",
      "Implement token refresh mechanism",
      "Check system clock is synchronized",
    ],
    documentation: "security.md#token-expiration",
  },

  [ERROR_CODES.UNKNOWN_ERROR]: {
    message: "An unexpected error occurred: {reason}",
    suggestions: [
      "Check application logs for more details",
      "Enable verbose logging for debugging",
      "Report this issue if it persists",
      "Include error details in bug report",
    ],
    documentation: "troubleshooting.md",
  },
};

/**
 * Enhanced Error class with code and context
 */
class EnhancedError extends Error {
  constructor(code, context = {}, originalError = null) {
    const formattedMessage = formatError(code, context);
    super(formattedMessage.message);

    this.name = "EnhancedError";
    this.code = code;
    this.context = context;
    this.suggestions = formattedMessage.suggestions;
    this.documentation = formattedMessage.documentation;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EnhancedError);
    }
  }

  /**
   * Get formatted error message with all details
   */
  getFormattedMessage() {
    return formatErrorMessage(this);
  }

  /**
   * Convert to JSON for logging
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      suggestions: this.suggestions,
      documentation: this.documentation,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
      originalError: this.originalError
        ? {
            message: this.originalError.message,
            stack: this.originalError.stack,
          }
        : null,
    };
  }
}

/**
 * Format an error message with context
 *
 * @param {string} code - Error code
 * @param {object} context - Context variables
 * @returns {object} Formatted error details
 */
function formatError(code, context = {}) {
  const template =
    ERROR_TEMPLATES[code] || ERROR_TEMPLATES[ERROR_CODES.UNKNOWN_ERROR];

  // Replace placeholders in message
  let message = template.message;
  for (const [key, value] of Object.entries(context)) {
    message = message.replace(`{${key}}`, String(value));
  }

  // Replace placeholders in suggestions
  const suggestions = template.suggestions.map((suggestion) => {
    let formatted = suggestion;
    for (const [key, value] of Object.entries(context)) {
      formatted = formatted.replace(`{${key}}`, String(value));
    }
    return formatted;
  });

  return {
    code,
    message,
    suggestions,
    documentation: template.documentation,
    context,
  };
}

/**
 * Format error message for display
 *
 * @param {Error|EnhancedError} error - Error to format
 * @param {object} options - Formatting options
 * @returns {string} Formatted error message
 */
function formatErrorMessage(error, options = {}) {
  const {
    includeCode = true,
    includeSuggestions = true,
    includeDocumentation = true,
    includeContext = false,
    includeStack = false,
    color = false,
  } = options;

  let output = [];

  // Error header
  if (includeCode && error.code) {
    output.push(`Error [${error.code}]: ${error.message}`);
  } else {
    output.push(`Error: ${error.message}`);
  }

  // Context (optional)
  if (
    includeContext &&
    error.context &&
    Object.keys(error.context).length > 0
  ) {
    output.push("\nContext:");
    for (const [key, value] of Object.entries(error.context)) {
      output.push(`  ${key}: ${JSON.stringify(value)}`);
    }
  }

  // Suggestions
  if (includeSuggestions && error.suggestions && error.suggestions.length > 0) {
    output.push("\nSuggestions:");
    error.suggestions.forEach((suggestion, index) => {
      output.push(`  ${index + 1}. ${suggestion}`);
    });
  }

  // Documentation link
  if (includeDocumentation && error.documentation) {
    output.push(
      `\nDocumentation: https://docs.rag-pipeline-utils.dev/${error.documentation}`,
    );
  }

  // Stack trace (optional)
  if (includeStack && error.stack) {
    output.push("\nStack Trace:");
    output.push(error.stack);
  }

  return output.join("\n");
}

/**
 * Create an enhanced error
 *
 * @param {string} code - Error code
 * @param {object} context - Context variables
 * @param {Error} originalError - Original error (optional)
 * @returns {EnhancedError} Enhanced error instance
 */
function createError(code, context = {}, originalError = null) {
  return new EnhancedError(code, context, originalError);
}

/**
 * Wrap an existing error with enhanced context
 *
 * @param {Error} error - Original error
 * @param {string} code - Error code
 * @param {object} context - Additional context
 * @returns {EnhancedError} Enhanced error
 */
function wrapError(error, code, context = {}) {
  return new EnhancedError(
    code,
    {
      ...context,
      originalMessage: error.message,
    },
    error,
  );
}

/**
 * Check if an error is an EnhancedError
 *
 * @param {*} error - Value to check
 * @returns {boolean} True if enhanced error
 */
function isEnhancedError(error) {
  return error instanceof EnhancedError;
}

/**
 * Get error severity level
 *
 * @param {string} code - Error code
 * @returns {string} Severity level (critical, error, warning)
 */
function getErrorSeverity(code) {
  const critical = [
    ERROR_CODES.PIPELINE_CREATION_FAILED,
    ERROR_CODES.CONFIG_NOT_FOUND,
    ERROR_CODES.FS_PERMISSION_DENIED,
    ERROR_CODES.AUTH_INVALID_TOKEN,
  ];

  const warnings = [
    ERROR_CODES.HOT_RELOAD_FAILED,
    ERROR_CODES.HOT_RELOAD_STATE_ERROR,
  ];

  if (critical.includes(code)) return "critical";
  if (warnings.includes(code)) return "warning";
  return "error";
}

/**
 * Log error with appropriate formatting
 *
 * @param {Error|EnhancedError} error - Error to log
 * @param {object} logger - Logger instance (optional)
 */
function logError(error, logger = console) {
  const severity = isEnhancedError(error)
    ? getErrorSeverity(error.code)
    : "error";
  const formatted = formatErrorMessage(error, {
    includeSuggestions: true,
    includeDocumentation: true,
    includeStack: severity === "critical",
  });

  if (severity === "critical") {
    logger.error(formatted);
  } else if (severity === "warning") {
    logger.warn(formatted);
  } else {
    logger.error(formatted);
  }
}

module.exports = {
  ERROR_CODES,
  ERROR_TEMPLATES,
  EnhancedError,
  createError,
  wrapError,
  formatError,
  formatErrorMessage,
  isEnhancedError,
  getErrorSeverity,
  logError,
};
