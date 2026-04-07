/**
 * Configuration checker for RAG Pipeline Diagnostics
 * Checks configuration file existence, validity, and schema compliance
 */

const fs = require("fs/promises");

/**
 * Check configuration issues
 * @param {object} options - Doctor options (must include configPath)
 * @returns {Promise<Array>} Array of configuration issues
 */
async function checkConfiguration(options) {
  const issues = [];

  try {
    await fs.access(options.configPath);
  } catch (error) {
    issues.push({
      category: "configuration",
      severity: "error",
      code: "CONFIG_MISSING",
      message: `Configuration file not found: ${options.configPath}`,
      fix: 'Run "rag-pipeline init" to create a configuration file',
      autoFixable: false,
    });
    return issues;
  }

  try {
    const configContent = await fs.readFile(options.configPath, "utf8");
    const config = JSON.parse(configContent);

    // Check if config is empty
    if (Object.keys(config).length === 0 || !config.plugins) {
      issues.push({
        category: "configuration",
        severity: "warning",
        code: "CONFIG_EMPTY",
        message: "Configuration file is empty or missing required sections",
        fix: "Add plugin configurations and pipeline settings",
        autoFixable: false,
      });
    }

    // Validate schema if available
    try {
      const {
        validateEnhancedRagrcSchema,
      } = require("../../config/enhanced-ragrc-schema.js");
      const validation = validateEnhancedRagrcSchema(config);
      if (!validation.valid && validation.errors) {
        validation.errors.forEach((error) => {
          issues.push({
            category: "configuration",
            severity: "error",
            code: "CONFIG_SCHEMA_ERROR",
            message: `Schema validation failed: ${error.instancePath} ${error.message}`,
            fix: "Fix configuration schema errors",
            autoFixable: false,
          });
        });
      }
    } catch (schemaError) {
      // Schema validation not available, skip
    }
  } catch (parseError) {
    issues.push({
      category: "configuration",
      severity: "error",
      code: "CONFIG_INVALID_JSON",
      message: "Configuration file contains invalid JSON syntax",
      fix: `Fix JSON syntax errors in ${options.configPath}`,
      autoFixable: false,
    });
  }

  return issues;
}

module.exports = { checkConfiguration };
