/**
 * Doctor Command for RAG Pipeline Diagnostics
 * Scans for common issues and provides actionable solutions
 *
 * This module serves as the orchestrator, delegating individual checks
 * to focused checker modules in the diagnostics/ directory.
 */

const fs = require("fs/promises");
const path = require("path");

const { checkConfiguration } = require("./diagnostics/config-checker.js");
const { checkPlugins } = require("./diagnostics/plugin-checker.js");
const { checkDependencies } = require("./diagnostics/dependency-checker.js");
const { checkPerformance } = require("./diagnostics/performance-checker.js");
const { checkSecurity } = require("./diagnostics/security-checker.js");
const { checkEnvironment } = require("./diagnostics/environment-checker.js");

/**
 * Diagnostic categories
 */
const DIAGNOSTIC_CATEGORIES = {
  CONFIGURATION: "configuration",
  PLUGINS: "plugins",
  DEPENDENCIES: "dependencies",
  PERFORMANCE: "performance",
  SECURITY: "security",
  ENVIRONMENT: "environment",
};

/**
 * Issue severity levels
 */
const SEVERITY_LEVELS = {
  ERROR: "error",
  WARNING: "warning",
  INFO: "info",
  SUCCESS: "success",
};

/**
 * Doctor command for pipeline diagnostics
 */
class PipelineDoctor {
  constructor(_options = {}) {
    this.options = {
      configPath: _options.configPath || ".ragrc.json",
      verbose: _options.verbose || false,
      autoFix: _options.autoFix || false,
      categories: _options.categories || ["all"],
      ..._options,
    };
  }

  /**
   * Check configuration issues
   * @returns {Promise<Array>} Array of configuration issues
   */
  async checkConfiguration() {
    return checkConfiguration(this.options);
  }

  /**
   * Check plugin issues
   * @returns {Promise<Array>} Array of plugin issues
   */
  async checkPlugins() {
    return checkPlugins(this.options);
  }

  /**
   * Check dependency issues
   * @returns {Promise<Array>} Array of dependency issues
   */
  async checkDependencies() {
    return checkDependencies(this.options);
  }

  /**
   * Check performance issues
   * @returns {Promise<Array>} Array of performance issues
   */
  async checkPerformance() {
    return checkPerformance(this.options);
  }

  /**
   * Check security issues
   * @returns {Promise<Array>} Array of security issues
   */
  async checkSecurity() {
    return checkSecurity(this.options);
  }

  /**
   * Check environment issues
   * @returns {Promise<Array>} Array of environment issues
   */
  async checkEnvironment() {
    return checkEnvironment(this.options);
  }

  /**
   * Execute a command safely using execFile with args array (mockable for testing)
   * @param {string} command - Command to execute
   * @param {Array<string>} args - Command arguments
   * @param {object} options - Execution options
   * @returns {Promise<object>} Execution result
   */
  async execSafe(command, args = [], options = {}) {
    const { execFile } = require("child_process");
    const { promisify } = require("util");
    const execFileAsync = promisify(execFile);

    // Validate command is in allowlist
    const ALLOWED_COMMANDS = ["npm", "chmod", "node", "icacls"];
    if (!ALLOWED_COMMANDS.includes(command)) {
      throw new Error(`Command not allowed: ${command}`);
    }

    // Sanitize arguments
    const sanitizedArgs = args.map((arg) => {
      if (typeof arg !== "string") {
        throw new Error("All arguments must be strings");
      }
      // Remove shell metacharacters
      return arg.replace(/[;&|`$(){}[\]<>"'\\]/g, "");
    });

    const execOptions = {
      shell: false, // Never use shell to prevent injection
      timeout: options.timeout || 30000,
      env: { ...process.env, PATH: process.env.PATH }, // Controlled environment
      ...options,
    };

    return await execFileAsync(command, sanitizedArgs, execOptions);
  }

  /**
   * Auto-fix an issue if possible
   * @param {object} issue - Issue to fix
   * @returns {Promise<object>} Fix result
   */
  async autoFix(issue) {
    if (!issue.autoFixable) {
      return {
        success: false,
        message: "Issue is not auto-fixable",
      };
    }

    try {
      if (issue.code === "NPM_DEPENDENCY_MISSING") {
        // Use execSafe with validated command and args
        const result = await this.execSafe("npm", [
          "install",
          "--no-fund",
          "--no-audit",
        ]);
        return {
          success: true,
          message: result.stdout || "Dependencies installed",
        };
      }

      if (issue.code === "INSECURE_PERMISSIONS") {
        // Validate config path is within project directory
        const configPath = path.resolve(this.options.configPath);
        const projectDir = path.resolve(".");
        if (!configPath.startsWith(projectDir)) {
          throw new Error("Config path outside project directory");
        }

        // Check if running on Windows
        if (process.platform === "win32") {
          // On Windows, attempt to use icacls or fall back to fs.chmod
          try {
            await this.execSafe("icacls", [
              configPath,
              "/inheritance:r",
              "/grant",
              `${require("os").userInfo().username}:F`,
            ]);
          } catch (icaclsError) {
            // Fall back to fs.chmod if icacls fails
            try {
              await fs.chmod(configPath, 0o600);
            } catch (chmodError) {
              throw new Error(
                `Failed to update permissions: ${chmodError.message}`,
              );
            }
          }
        } else {
          // Use chmod on Unix-like systems
          await this.execSafe("chmod", ["600", configPath]);
        }

        return {
          success: true,
          message: "Permissions updated",
        };
      }

      return {
        success: false,
        message: "Auto-fix not implemented for this issue type",
      };
    } catch (error) {
      return {
        success: false,
        message: `Auto-fix failed: ${error.message}`,
      };
    }
  }

  /**
   * Generate diagnostic report
   * @param {Array} issues - Array of issues
   * @returns {object} Diagnostic report
   */
  generateReport(issues) {
    const summary = {
      totalIssues: issues.length,
      errors: issues.filter((i) => i.severity === "error").length,
      warnings: issues.filter((i) => i.severity === "warning").length,
      info: issues.filter((i) => i.severity === "info").length,
      healthScore: Math.max(
        0,
        100 -
          (issues.filter((i) => i.severity === "error").length * 25 +
            issues.filter((i) => i.severity === "warning").length * 10 +
            issues.filter((i) => i.severity === "info").length * 2),
      ),
    };

    const categories = {
      configuration: { issues: 0, errors: 0, warnings: 0, info: 0 },
      plugins: { issues: 0, errors: 0, warnings: 0, info: 0 },
      dependencies: { issues: 0, errors: 0, warnings: 0, info: 0 },
      performance: { issues: 0, errors: 0, warnings: 0, info: 0 },
      security: { issues: 0, errors: 0, warnings: 0, info: 0 },
      environment: { issues: 0, errors: 0, warnings: 0, info: 0 },
    };

    issues.forEach((issue) => {
      if (categories[issue.category]) {
        categories[issue.category].issues++;
        if (issue.severity === "error") {
          categories[issue.category].errors++;
        } else if (issue.severity === "warning") {
          categories[issue.category].warnings++;
        } else if (issue.severity === "info") {
          categories[issue.category].info++;
        }
      }
    });

    return {
      timestamp: new Date().toISOString(),
      summary,
      categories,
      issues,
    };
  }

  /**
   * Run all diagnostic checks
   * @returns {Promise<object>} Diagnostic report
   */
  async run() {
    const allIssues = [];

    const categoriesToRun = this.options.categories.includes("all")
      ? Object.values(DIAGNOSTIC_CATEGORIES)
      : this.options.categories;

    if (categoriesToRun.includes("configuration")) {
      const configIssues = await this.checkConfiguration();
      allIssues.push(...configIssues);
    }

    if (categoriesToRun.includes("plugins")) {
      const pluginIssues = await this.checkPlugins();
      allIssues.push(...pluginIssues);
    }

    if (categoriesToRun.includes("dependencies")) {
      const depIssues = await this.checkDependencies();
      allIssues.push(...depIssues);
    }

    if (categoriesToRun.includes("performance")) {
      const perfIssues = await this.checkPerformance();
      allIssues.push(...perfIssues);
    }

    if (categoriesToRun.includes("security")) {
      const secIssues = await this.checkSecurity();
      allIssues.push(...secIssues);
    }

    if (categoriesToRun.includes("environment")) {
      const envIssues = await this.checkEnvironment();
      allIssues.push(...envIssues);
    }

    // Auto-fix issues if enabled
    if (this.options.autoFix) {
      for (const issue of allIssues) {
        if (issue.autoFixable) {
          await this.autoFix(issue);
        }
      }
    }

    return this.generateReport(allIssues);
  }
}

/**
 * Main doctor function for CLI usage
 * @param {object} options - Doctor options
 * @returns {Promise<object>} Diagnostic report
 */
async function runPipelineDoctor(options = {}) {
  const doctor = new PipelineDoctor(options);
  return await doctor.run();
}

module.exports = {
  PipelineDoctor,
  runPipelineDoctor,
  DIAGNOSTIC_CATEGORIES,
  SEVERITY_LEVELS,
};

// CommonJS/ESM interop
module.exports.default = module.exports;
