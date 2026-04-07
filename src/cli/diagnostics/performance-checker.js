/**
 * Performance checker for RAG Pipeline Diagnostics
 * Checks memory usage and configuration file size
 */

const fs = require("fs/promises");

/**
 * Check performance issues
 * @param {object} options - Doctor options (must include configPath)
 * @returns {Promise<Array>} Array of performance issues
 */
async function checkPerformance(options) {
  const issues = [];

  // Check memory usage
  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  if (heapUsedMB > 512) {
    issues.push({
      category: "performance",
      severity: "warning",
      code: "MEMORY_USAGE_HIGH",
      message: `High memory usage detected: ${heapUsedMB}MB used`,
      fix: "Consider reducing batch sizes or enabling streaming",
      autoFixable: false,
    });
  }

  // Check config file size
  try {
    const stats = await fs.stat(options.configPath);
    const sizeMB = stats.size / 1024 / 1024;
    if (sizeMB > 1) {
      issues.push({
        category: "performance",
        severity: "warning",
        code: "CONFIG_FILE_LARGE",
        message: `Configuration file is unusually large: ${sizeMB.toFixed(1)}MB`,
        fix: "Consider splitting configuration or removing unused sections",
        autoFixable: false,
      });
    }
  } catch (error) {
    // File doesn't exist, handled elsewhere
  }

  return issues;
}

module.exports = { checkPerformance };
