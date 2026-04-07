/**
 * Security checker for RAG Pipeline Diagnostics
 * Checks for hardcoded API keys and insecure file permissions
 */

const fs = require("fs/promises");

/**
 * Check security issues
 * @param {object} options - Doctor options (must include configPath)
 * @returns {Promise<Array>} Array of security issues
 */
async function checkSecurity(options) {
  const issues = [];

  // Check for hardcoded API keys in config content
  try {
    const configContent = await fs.readFile(options.configPath, "utf8");
    const config = JSON.parse(configContent);

    const configStr = JSON.stringify(config);
    if (
      configStr.includes("sk-") ||
      configStr.includes("apiKey") ||
      configStr.includes("api_key")
    ) {
      issues.push({
        category: "security",
        severity: "error",
        code: "HARDCODED_API_KEY",
        message: "Hardcoded API key detected in configuration",
        fix: "Move API keys to environment variables",
        autoFixable: false,
      });
    }
  } catch (configError) {
    // Config reading issues handled elsewhere
  }

  // Check file permissions (independent of config content)
  try {
    const stats = await fs.stat(options.configPath);
    const mode = stats.mode & 0o777;
    if (mode === 0o777) {
      issues.push({
        category: "security",
        severity: "warning",
        code: "INSECURE_PERMISSIONS",
        message: "Configuration file has insecure permissions (777)",
        fix: `Set secure permissions: chmod 600 ${options.configPath}`,
        autoFixable: true,
      });
    }
  } catch (statError) {
    // File stat issues handled elsewhere
  }

  return issues;
}

module.exports = { checkSecurity };
