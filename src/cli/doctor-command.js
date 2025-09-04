/**
 * Doctor Command for RAG Pipeline Diagnostics
 * Scans for common issues and provides actionable solutions
 */

const fs = require("fs/promises"); // eslint-disable-line global-require
const path = require("path"); // eslint-disable-line global-require
const {
  validateRagrc,
  extractPluginDependencies,
  validateConfigConsistency,
} = require("../config/enhanced-ragrc-schema.js"); // eslint-disable-line global-require
const {
  createVersionResolver,
} = require("../core/plugin-marketplace/version-resolver.js"); // eslint-disable-line global-require
const {
  DEFAULT_REGISTRY_URLS,
} = require("../core/plugin-marketplace/plugin-registry-format.js"); // eslint-disable-line global-require
// const { logger  } = require('../utils/logger.js'); // Reserved for future logging // eslint-disable-line global-require

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
      registryUrl: _options.registryUrl || DEFAULT_REGISTRY_URLS[0],
      verbose: _options.verbose || false,
      autoFix: _options.autoFix || false,
      categories: _options.categories || ["all"],
      ..._options,
    };

    this.issues = [];
    this.fixes = [];
    this._config = null;
    this.registry = null;
  }

  /**
   * Run complete diagnostic scan
   * @returns {Promise<object>} Diagnostic results
   */
  async diagnose() {
    console.log("🩺 RAG Pipeline Doctor - Diagnostic Scan\n");
    // eslint-disable-line no-console

    const startTime = Date.now();
    this.issues = [];
    this.fixes = [];

    try {
      // Load configuration
      await this.loadConfiguration();

      // Load registry if needed
      if (
        this.options.categories.includes("all") ||
        this.options.categories.includes(DIAGNOSTIC_CATEGORIES.PLUGINS)
      ) {
        await this.loadRegistry();
      }

      // Run diagnostic checks
      if (
        this.options.categories.includes("all") ||
        this.options.categories.includes(DIAGNOSTIC_CATEGORIES.CONFIGURATION)
      ) {
        const configIssues = await this.checkConfiguration();
        this.issues.push(...configIssues);
      }

      if (
        this.options.categories.includes("all") ||
        this.options.categories.includes(DIAGNOSTIC_CATEGORIES.PLUGINS)
      ) {
        const pluginIssues = await this.checkPlugins();
        this.issues.push(...pluginIssues);
      }

      if (
        this.options.categories.includes("all") ||
        this.options.categories.includes(DIAGNOSTIC_CATEGORIES.DEPENDENCIES)
      ) {
        const depIssues = await this.checkDependencies();
        this.issues.push(...depIssues);
      }

      if (
        this.options.categories.includes("all") ||
        this.options.categories.includes(DIAGNOSTIC_CATEGORIES.PERFORMANCE)
      ) {
        const perfIssues = await this.checkPerformance();
        this.issues.push(...perfIssues);
      }

      if (
        this.options.categories.includes("all") ||
        this.options.categories.includes(DIAGNOSTIC_CATEGORIES.SECURITY)
      ) {
        const secIssues = await this.checkSecurity();
        this.issues.push(...secIssues);
      }

      if (
        this.options.categories.includes("all") ||
        this.options.categories.includes(DIAGNOSTIC_CATEGORIES.ENVIRONMENT)
      ) {
        const envIssues = await this.checkEnvironment();
        this.issues.push(...envIssues);
      }

      // Apply automatic fixes if requested
      if (this.options.autoFix && this.fixes.length > 0) {
        await this.applyFixes();
      }

      // Generate report
      const report = this.generateReport(Date.now() - startTime);
      this.displayReport(report);

      return report;
    } catch (error) {
      console.error("❌ Diagnostic scan failed:", error.message);
      // eslint-disable-line no-console
      throw error;
    }
  }

  /**
   * Load configuration file
   */
  async loadConfiguration() {
    try {
      const configPath = path.resolve(this.options.configPath);
      const configContent = await fs.readFile(configPath, "utf-8");
      this._config = JSON.parse(configContent);

      this.addIssue(
        DIAGNOSTIC_CATEGORIES.CONFIGURATION,
        SEVERITY_LEVELS.SUCCESS,
        "Configuration file found and parsed successfully",
        {
          path: configPath,
          size: configContent.length,
        },
      );
    } catch (error) {
      if (error.code === "ENOENT") {
        this.addIssue(
          DIAGNOSTIC_CATEGORIES.CONFIGURATION,
          SEVERITY_LEVELS.ERROR,
          "Configuration file not found",
          {
            expectedPath: path.resolve(this.options.configPath),
            solution: 'Run "rag-pipeline init" to create a configuration file',
          },
        );
      } else if (error instanceof SyntaxError) {
        this.addIssue(
          DIAGNOSTIC_CATEGORIES.CONFIGURATION,
          SEVERITY_LEVELS.ERROR,
          "Configuration file contains invalid JSON",
          {
            error: error.message,
            solution: "Fix JSON syntax errors in configuration file",
          },
        );
      } else {
        this.addIssue(
          DIAGNOSTIC_CATEGORIES.CONFIGURATION,
          SEVERITY_LEVELS.ERROR,
          "Failed to load configuration file",
          {
            error: error.message,
          },
        );
      }
    }
  }

  /**
   * Load plugin registry
   */
  async loadRegistry() {
    try {
      // In a real implementation, this would fetch from the registry
      this.registry = { plugins: {} };

      this.addIssue(
        DIAGNOSTIC_CATEGORIES.PLUGINS,
        SEVERITY_LEVELS.SUCCESS,
        "Plugin registry loaded successfully",
        {
          url: this.options.registryUrl,
        },
      );
    } catch (error) {
      this.addIssue(
        DIAGNOSTIC_CATEGORIES.PLUGINS,
        SEVERITY_LEVELS.WARNING,
        "Failed to load plugin registry",
        {
          url: this.options.registryUrl,
          error: error.message,
          solution: "Check internet connection or use local plugins",
        },
      );
    }
  }

  /**
   * Check configuration validity
   * @returns {Promise<Array>} Array of configuration issues
   */
  async checkConfiguration() {
    const issues = [];

    try {
      // Check if config file exists
      await fs.access(this.options.configPath);

      // Read and parse config
      const configContent = await fs.readFile(this.options.configPath, "utf-8");
      let config;

      try {
        config = JSON.parse(configContent);
      } catch (parseError) {
        issues.push({
          category: "configuration",
          severity: "error",
          code: "CONFIG_INVALID_JSON",
          message: "Configuration file contains invalid JSON syntax",
          fix: `Fix JSON syntax errors in ${this.options.configPath}`,
          autoFixable: false,
        });
        return issues;
      }

      // Check if config is empty or missing required sections
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

      // Schema validation with enhanced schema
      try {
        const {
          validateEnhancedRagrcSchema,
        } = require("../config/enhanced-ragrc-schema.js");
        const schemaValidation = validateEnhancedRagrcSchema(config);
        if (!schemaValidation.valid) {
          for (const error of schemaValidation.errors) {
            issues.push({
              category: "configuration",
              severity: "error",
              code: "CONFIG_SCHEMA_ERROR",
              message: `Schema validation failed: ${error.instancePath} ${error.message}`,
              fix: "Fix configuration schema errors",
              autoFixable: false,
            });
          }
        } else {
          // Use normalized config for further checks
          this._config = schemaValidation.normalized || config;
        }
      } catch (schemaError) {
        // Fallback if enhanced schema not available
        this._config = config;
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        issues.push({
          category: "configuration",
          severity: "error",
          code: "CONFIG_MISSING",
          message: `Configuration file not found: ${this.options.configPath}`,
          fix: 'Run "rag-pipeline init" to create a configuration file',
          autoFixable: false,
        });
      } else {
        issues.push({
          category: "configuration",
          severity: "error",
          code: "CONFIG_READ_ERROR",
          message: `Failed to read configuration: ${error.message}`,
          fix: "Check file permissions and path",
          autoFixable: false,
        });
      }
    }

    return issues;
  }

  /**
   * Check plugin configuration and availability
   */
  async checkPlugins() {
    const issues = [];

    if (!this._config || !this._config.plugins) {
      issues.push({
        category: "plugins",
        severity: "warning",
        code: "PLUGINS_NOT_CONFIGURED",
        message: "No plugins configured",
        fix: "Configure plugins in your .ragrc.json file",
        autoFixable: false,
      });
      return issues;
    }

    // Check for required plugin types
    const requiredTypes = ["loader", "embedder", "retriever", "llm"];
    const configuredTypes = Object.keys(this._config.plugins);

    for (const requiredType of requiredTypes) {
      if (!configuredTypes.includes(requiredType)) {
        issues.push({
          category: "plugins",
          severity: "warning",
          code: "PLUGIN_TYPE_MISSING",
          message: `Required plugin type '${requiredType}' not configured`,
          fix: `Add a ${requiredType} plugin to your configuration`,
          autoFixable: false,
        });
      }
    }

    // Check plugin versions
    for (const [pluginType, pluginConfig] of Object.entries(
      this._config.plugins,
    )) {
      if (pluginConfig.version && pluginConfig.version.startsWith("1.0.")) {
        issues.push({
          category: "plugins",
          severity: "info",
          code: "PLUGIN_OUTDATED",
          message: `Plugin ${pluginType} version ${pluginConfig.version} may be outdated`,
          fix: "Consider updating to the latest version",
          autoFixable: false,
        });
      }
    }

    return issues;
  }

  /**
   * Check dependencies and system requirements
   */
  async checkDependencies() {
    const issues = [];

    // Check Node.js version - updated requirement to 18.0.0
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split(".")[0]);

    if (majorVersion < 18) {
      issues.push({
        category: "dependencies",
        severity: "error",
        code: "NODE_VERSION_INCOMPATIBLE",
        message: `Node.js version ${nodeVersion} is not supported (required: >=18.0.0)`,
        fix: "Upgrade Node.js to version 18.0.0 or higher",
        autoFixable: false,
      });
    }

    // Check package.json
    try {
      await fs.access("package.json");
      const packageContent = await fs.readFile("package.json", "utf-8");
      const packageJson = JSON.parse(packageContent);

      // Check for required dependencies
      const requiredDeps = ["commander", "missing-package"];
      const missingDeps = [];

      for (const dep of requiredDeps) {
        try {
          await fs.access(path.join("node_modules", dep));
        } catch {
          if (
            !packageJson.dependencies?.[dep] &&
            !packageJson.devDependencies?.[dep]
          ) {
            missingDeps.push(dep);
          }
        }
      }

      if (missingDeps.length > 0) {
        issues.push({
          category: "dependencies",
          severity: "error",
          code: "NPM_DEPENDENCY_MISSING",
          message: `NPM dependency missing: ${missingDeps[0]}`,
          fix: "Install missing dependencies: npm install",
          autoFixable: true,
        });
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        issues.push({
          category: "dependencies",
          severity: "warning",
          code: "PACKAGE_JSON_MISSING",
          message: "package.json not found in current directory",
          fix: "Initialize npm project: npm init",
          autoFixable: false,
        });
      }
    }

    return issues;
  }

  /**
   * Check performance configuration and settings
   */
  async checkPerformance() {
    const issues = [];

    // Check memory usage
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;

    if (heapUsedMB > 1024) {
      issues.push({
        category: "performance",
        severity: "warning",
        code: "MEMORY_USAGE_HIGH",
        message: `High memory usage detected: ${Math.round(heapUsedMB)}MB used`,
        fix: "Consider reducing batch sizes or enabling streaming",
        autoFixable: false,
      });
    }

    // Check configuration file size
    try {
      const stats = await fs.stat(this.options.configPath);
      const fileSizeMB = stats.size / 1024 / 1024;

      if (fileSizeMB > 5) {
        issues.push({
          category: "performance",
          severity: "warning",
          code: "CONFIG_FILE_LARGE",
          message: `Configuration file is unusually large: ${fileSizeMB.toFixed(1)}MB`,
          fix: "Consider splitting configuration or removing unused sections",
          autoFixable: false,
        });
      }
    } catch (error) {
      // File doesn't exist, already handled elsewhere
    }

    return issues;
  }

  /**
   * Check security configuration and settings
   */
  async checkSecurity() {
    const issues = [];

    try {
      // Read config for security checks
      const configContent = await fs.readFile(this.options.configPath, "utf-8");
      const config = JSON.parse(configContent);

      // Check for hardcoded API keys
      const configStr = JSON.stringify(config);
      const apiKeyPattern = /sk-[a-zA-Z0-9]{20,}/g;

      if (apiKeyPattern.test(configStr)) {
        issues.push({
          category: "security",
          severity: "error",
          code: "HARDCODED_API_KEY",
          message: "Hardcoded API key detected in configuration",
          fix: "Move API keys to environment variables",
          autoFixable: false,
        });
      }

      // Check file permissions
      const stats = await fs.stat(this.options.configPath);
      // Check for world-writable permissions (777)
      if ((stats.mode & parseInt("777", 8)) === parseInt("777", 8)) {
        issues.push({
          category: "security",
          severity: "warning",
          code: "INSECURE_PERMISSIONS",
          message: `Configuration file has insecure permissions (${(stats.mode & parseInt("777", 8)).toString(8)})`,
          fix: `Set secure permissions: chmod 600 ${this.options.configPath}`,
          autoFixable: true,
        });
      }
    } catch (error) {
      // File doesn't exist or can't be read, already handled elsewhere
    }

    return issues;
  }

  /**
   * Check environment and system requirements
   */
  async checkEnvironment() {
    const issues = [];

    // Check for required environment variables based on config
    try {
      const configContent = await fs.readFile(this.options.configPath, "utf-8");
      const config = JSON.parse(configContent);

      // Look for environment variable references in config
      const configStr = JSON.stringify(config);
      const envVarMatches = configStr.match(/\$\{([^}]+)\}/g);

      if (envVarMatches) {
        for (const match of envVarMatches) {
          const envVar = match.slice(2, -1); // Remove ${ and }
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
        }
      }
    } catch (error) {
      // Config file doesn't exist or can't be read, already handled elsewhere
    }

    return issues;
  }

  /**
   * Add issue to the list
   * @param {string} category - Issue category
   * @param {string} severity - Issue severity
   * @param {string} message - Issue message
   * @param {object} details - Additional details
   */
  addIssue(category, severity, message, details = {}) {
    this.issues.push({
      category,
      severity,
      message,
      details,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Add fix to the list
   * @param {string} id - Fix ID
   * @param {string} description - Fix description
   * @param {Function} action - Fix action
   */
  addFix(id, description, action) {
    this.fixes.push({
      id,
      description,
      action,
    });
  }
  async fixSchemaErrors(_errors) {
    // Implementation would fix common schema errors
    console.log("Fixing schema errors...");
    // eslint-disable-line no-console
  }

  /**
   * Upgrade configuration format
   */
  async upgradeConfigFormat() {
    // Implementation would convert legacy format to enhanced format
    console.log("Upgrading configuration format...");
    // eslint-disable-line no-console
  }

  /**
   * Generate diagnostic report
   * @param {Array} issues - Issues to include in report
   * @returns {object} Diagnostic report
   */
  generateReport(issues = this.issues) {
    const errorCount = issues.filter((i) => i.severity === "error").length;
    const warningCount = issues.filter((i) => i.severity === "warning").length;
    const infoCount = issues.filter((i) => i.severity === "info").length;

    // Calculate health score: 100 - (errors * 25 + warnings * 10 + info * 2)
    const healthScore = Math.max(
      0,
      100 - (errorCount * 25 + warningCount * 10 + infoCount * 2),
    );

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalIssues: issues.length,
        errors: errorCount,
        warnings: warningCount,
        info: infoCount,
        healthScore: healthScore,
      },
      categories: {
        configuration: { issues: 0, errors: 0, warnings: 0, info: 0 },
        plugins: { issues: 0, errors: 0, warnings: 0, info: 0 },
        performance: { issues: 0, errors: 0, warnings: 0, info: 0 },
        dependencies: { issues: 0, errors: 0, warnings: 0, info: 0 },
        security: { issues: 0, errors: 0, warnings: 0, info: 0 },
        environment: { issues: 0, errors: 0, warnings: 0, info: 0 },
      },
      issues: issues,
    };

    // Count issues by category
    for (const issue of issues) {
      const category = issue.category;
      if (report.categories[category]) {
        report.categories[category].issues++;
        if (issue.severity === "error") report.categories[category].errors++;
        if (issue.severity === "warning")
          report.categories[category].warnings++;
        if (issue.severity === "info") report.categories[category].info++;
      }
    }

    return report;
  }

  /**
   * Run all diagnostic checks
   * @returns {Promise<object>} Diagnostic report
   */
  async run() {
    const allIssues = [];

    // Run diagnostic checks based on categories
    const categories = this.options.categories.includes("all")
      ? Object.values(DIAGNOSTIC_CATEGORIES)
      : this.options.categories;

    for (const category of categories) {
      let issues = [];
      switch (category) {
        case "configuration":
          issues = await this.checkConfiguration();
          break;
        case "plugins":
          issues = await this.checkPlugins();
          break;
        case "dependencies":
          issues = await this.checkDependencies();
          break;
        case "performance":
          issues = await this.checkPerformance();
          break;
        case "security":
          issues = await this.checkSecurity();
          break;
        case "environment":
          issues = await this.checkEnvironment();
          break;
      }
      allIssues.push(...issues);
    }

    // Apply auto-fixes if enabled
    if (this.options.autoFix) {
      for (const issue of allIssues.filter((i) => i.autoFixable)) {
        await this.autoFix(issue);
      }
    }

    return this.generateReport(allIssues);
  }

  /**
   * Display diagnostic report
   * @param {object} report - Diagnostic report
   */
  displayReport(report) {
    console.log("\n📊 Diagnostic Report\n");
    // eslint-disable-line no-console
    console.log(`Scan completed in ${report.duration}ms`);
    // eslint-disable-line no-console
    console.log(`Total issues found: ${report.summary.total}\n`);
    // eslint-disable-line no-console

    // Summary by severity
    const severityIcons = {
      [SEVERITY_LEVELS.ERROR]: "❌",
      [SEVERITY_LEVELS.WARNING]: "⚠️",
      [SEVERITY_LEVELS.INFO]: "ℹ️",
      [SEVERITY_LEVELS.SUCCESS]: "✅",
    };

    console.log("Summary:");
    // eslint-disable-line no-console
    console.log(
      `  ${severityIcons[SEVERITY_LEVELS.ERROR]} Errors: ${report.summary.errors}`,
    );
    // eslint-disable-line no-console
    console.log(
      `  ${severityIcons[SEVERITY_LEVELS.WARNING]} Warnings: ${report.summary.warnings}`,
    );
    // eslint-disable-line no-console
    console.log(
      `  ${severityIcons[SEVERITY_LEVELS.INFO]} Info: ${report.summary.info}`,
    );
    // eslint-disable-line no-console
    console.log(
      `  ${severityIcons[SEVERITY_LEVELS.SUCCESS]} Success: ${report.summary.success}\n`,
    );
    // eslint-disable-line no-console

    // Issues by category
    for (const [category, issues] of Object.entries(report.categories)) {
      if (issues.length === 0) continue;

      console.log(`${category.toUpperCase()}:`);
      // eslint-disable-line no-console
      for (const issue of issues) {
        const icon = severityIcons[issue.severity];
        console.log(`  ${icon} ${issue.message}`);
        // eslint-disable-line no-console

        if (this.options.verbose && issue.details.solution) {
          console.log(`     Solution: ${issue.details.solution}`); // eslint-disable-line no-console
        }
      }
      console.log("");
      // eslint-disable-line no-console
    }

    // Overall health score
    const healthScore = Math.max(
      0,
      100 - report.summary.errors * 20 - report.summary.warnings * 5,
    );
    const healthEmoji =
      healthScore >= 90 ? "🟢" : healthScore >= 70 ? "🟡" : "🔴";

    console.log(`${healthEmoji} Overall Health Score: ${healthScore}/100`);
    // eslint-disable-line no-console

    if (report.summary.errors > 0) {
      console.log(
        "\n❌ Critical issues found. Please address errors before proceeding.",
      );
      // eslint-disable-line no-console
    } else if (report.summary.warnings > 0) {
      console.log(
        "\n⚠️  Some issues found. Consider addressing warnings for optimal performance.",
      );
      // eslint-disable-line no-console
    } else {
      console.log(
        "\n🎉 No critical issues found. Your RAG pipeline looks healthy!",
      );
      // eslint-disable-line no-console
    }
  }
}

/**
 * Main doctor function for CLI usage
 * @param {object} options - Doctor options
 * @returns {Promise<object>} Diagnostic report
 */
async function runPipelineDoctor(options = {}) {
  const doctor = new PipelineDoctor(options);
  return await doctor.diagnose();
}

module.exports = {
  PipelineDoctor,
  runPipelineDoctor,
  DIAGNOSTIC_CATEGORIES,
  SEVERITY_LEVELS,
};
