/**
 * Environment checker for RAG Pipeline Diagnostics
 * Checks for missing environment variables referenced in configuration
 */

const fs = require("fs/promises");

/**
 * Check environment issues
 * @param {object} options - Doctor options (must include configPath)
 * @returns {Promise<Array>} Array of environment issues
 */
async function checkEnvironment(options) {
  const issues = [];

  try {
    const configContent = await fs.readFile(options.configPath, "utf8");
    const config = JSON.parse(configContent);

    // Check for missing environment variables
    const configStr = JSON.stringify(config);
    const envVarMatches = configStr.match(/\$\{([^}]+)\}/g);
    if (envVarMatches) {
      envVarMatches.forEach((match) => {
        const envVar = match.slice(2, -1);
        if (!process.env[envVar]) {
          issues.push({
            category: "environment",
            severity: "error",
            code: "ENV_VAR_MISSING",
            message: `Required environment variable missing: ${envVar}`,
            fix: `Set environment variable: export ${envVar}=your_key`,
            autoFixable: false,
          });
        }
      });
    }
  } catch (error) {
    // Config issues handled elsewhere
  }

  return issues;
}

module.exports = { checkEnvironment };
