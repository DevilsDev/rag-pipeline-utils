#!/usr/bin/env node
/**
 * @fileoverview Developer Experience Tooling
 * Provides developer tools for testing, debugging, and project maintenance
 *
 * @author DevilsDev Team
 * @since 2.1.8
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { createLogger } = require("../src/utils/structured-logger.js");

/**
 * Developer tools suite for enhanced development experience
 */
class DeveloperTools {
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.verbose = options.verbose || false;

    this.logger = createLogger({
      serviceName: "dev-tools",
      logLevel: this.verbose ? "debug" : "info",
      outputFormat: "console",
    });

    this.packageJson = this.loadPackageJson();
  }

  /**
   * Load package.json
   * @returns {Object} Package.json contents
   */
  loadPackageJson() {
    try {
      const packagePath = path.join(this.rootDir, "package.json");
      return JSON.parse(fs.readFileSync(packagePath, "utf8"));
    } catch (error) {
      this.logger.warn("Could not load package.json", { error: error.message });
      return {};
    }
  }

  /**
   * Execute command safely
   * @param {string} command - Command to execute
   * @param {Object} options - Execution options
   * @returns {string} Command output
   */
  execCommand(command, options = {}) {
    try {
      this.logger.debug("Executing command", { command });
      return execSync(command, {
        cwd: this.rootDir,
        encoding: "utf8",
        stdio: this.verbose ? "inherit" : "pipe",
        ...options,
      });
    } catch (error) {
      this.logger.error("Command execution failed", {
        command,
        error: error.message,
        exitCode: error.status,
      });
      throw error;
    }
  }

  /**
   * Run project health check
   */
  async healthCheck() {
    this.logger.info("🏥 Running project health check...");

    const checks = [];

    // Check Node.js version
    const nodeVersion = process.version;
    const requiredNode = this.packageJson.engines?.node;
    checks.push({
      name: "Node.js Version",
      status: requiredNode
        ? this.checkVersion(nodeVersion, requiredNode)
        : "unknown",
      details: `Current: ${nodeVersion}, Required: ${requiredNode || "not specified"}`,
    });

    // Check dependencies
    try {
      this.execCommand("npm list --depth=0", { stdio: "pipe" });
      checks.push({
        name: "Dependencies",
        status: "pass",
        details: "All dependencies resolved",
      });
    } catch (error) {
      checks.push({
        name: "Dependencies",
        status: "fail",
        details: "Missing dependencies detected",
      });
    }

    // Check for security vulnerabilities
    try {
      const auditOutput = this.execCommand("npm audit --audit-level=moderate", {
        stdio: "pipe",
      });
      const hasVulnerabilities = auditOutput.includes("vulnerabilities");
      checks.push({
        name: "Security Audit",
        status: hasVulnerabilities ? "warn" : "pass",
        details: hasVulnerabilities
          ? "Vulnerabilities found"
          : "No vulnerabilities",
      });
    } catch (error) {
      checks.push({
        name: "Security Audit",
        status: "fail",
        details: "Audit failed to run",
      });
    }

    // Check linting
    try {
      this.execCommand("npm run lint", { stdio: "pipe" });
      checks.push({
        name: "Linting",
        status: "pass",
        details: "No linting errors",
      });
    } catch (error) {
      checks.push({
        name: "Linting",
        status: "fail",
        details: "Linting errors found",
      });
    }

    // Check tests
    try {
      this.execCommand("npm test", { stdio: "pipe" });
      checks.push({
        name: "Tests",
        status: "pass",
        details: "All tests passing",
      });
    } catch (error) {
      checks.push({
        name: "Tests",
        status: "fail",
        details: "Test failures detected",
      });
    }

    // Generate report
    this.generateHealthReport(checks);
  }

  /**
   * Check version compatibility
   * @param {string} current - Current version
   * @param {string} required - Required version pattern
   * @returns {string} Status
   */
  checkVersion(current, required) {
    try {
      // Simple version check - can be enhanced with semver
      const currentMajor = parseInt(current.split(".")[0].replace("v", ""));
      const requiredMajor = parseInt(
        required.split(".")[0].replace(">=", "").replace("v", ""),
      );
      return currentMajor >= requiredMajor ? "pass" : "fail";
    } catch (error) {
      return "unknown";
    }
  }

  /**
   * Generate health check report
   * @param {Array} checks - Health check results
   */
  generateHealthReport(checks) {
    console.log("\n" + "=".repeat(60));
    console.log("🏥 PROJECT HEALTH REPORT");
    console.log("=".repeat(60));

    for (const check of checks) {
      const statusIcon =
        {
          pass: "✅",
          fail: "❌",
          warn: "⚠️",
          unknown: "❓",
        }[check.status] || "❓";

      console.log(`${statusIcon} ${check.name.padEnd(20)} ${check.details}`);
    }

    const passCount = checks.filter((c) => c.status === "pass").length;
    const failCount = checks.filter((c) => c.status === "fail").length;
    const warnCount = checks.filter((c) => c.status === "warn").length;

    console.log("\n" + "-".repeat(60));
    console.log(
      `Summary: ${passCount} passed, ${failCount} failed, ${warnCount} warnings`,
    );

    if (failCount > 0) {
      console.log("\n⚠️  Run fixes for failed checks before proceeding");
    } else if (warnCount > 0) {
      console.log("\n👍 Project is healthy with minor warnings");
    } else {
      console.log("\n🎉 Project is in excellent health!");
    }

    console.log("=".repeat(60) + "\n");
  }

  /**
   * Setup development environment
   */
  async setupDev() {
    this.logger.info("🛠️  Setting up development environment...");

    const tasks = [
      {
        name: "Install dependencies",
        command: "npm install",
      },
      {
        name: "Setup git hooks",
        command: "npx husky install",
      },
      {
        name: "Run initial linting",
        command: "npm run lint:fix",
      },
      {
        name: "Run tests",
        command: "npm test",
      },
    ];

    for (const task of tasks) {
      try {
        this.logger.info(`⏳ ${task.name}...`);
        this.execCommand(task.command);
        this.logger.info(`✅ ${task.name} completed`);
      } catch (error) {
        this.logger.error(`❌ ${task.name} failed`, { error: error.message });
        throw new Error(`Setup failed at: ${task.name}`);
      }
    }

    this.logger.info("🎉 Development environment setup completed!");
  }

  /**
   * Clean project files
   */
  async clean() {
    this.logger.info("🧹 Cleaning project files...");

    const cleanTargets = [
      "node_modules",
      "dist",
      "build",
      "coverage",
      ".nyc_output",
      "*.log",
      "npm-debug.log*",
      "yarn-debug.log*",
      "yarn-error.log*",
      "benchmark-results",
      "docs/api.*",
      "profiling-reports",
    ];

    for (const target of cleanTargets) {
      const targetPath = path.join(this.rootDir, target);

      try {
        if (target.includes("*")) {
          // Handle glob patterns
          const pattern = target.replace("*", "");
          const files = fs
            .readdirSync(this.rootDir)
            .filter((file) => file.includes(pattern));
          for (const file of files) {
            fs.unlinkSync(path.join(this.rootDir, file));
            this.logger.debug(`Removed file: ${file}`);
          }
        } else if (fs.existsSync(targetPath)) {
          const stats = fs.statSync(targetPath);
          if (stats.isDirectory()) {
            fs.rmSync(targetPath, { recursive: true, force: true });
            this.logger.debug(`Removed directory: ${target}`);
          } else {
            fs.unlinkSync(targetPath);
            this.logger.debug(`Removed file: ${target}`);
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to clean ${target}`, { error: error.message });
      }
    }

    this.logger.info("✅ Project cleaned successfully");
  }

  /**
   * Update dependencies
   */
  async updateDeps() {
    this.logger.info("📦 Updating dependencies...");

    try {
      // Check for outdated packages
      this.logger.info("Checking for outdated packages...");
      const outdated = this.execCommand("npm outdated --json", {
        stdio: "pipe",
      });
      const outdatedPackages = JSON.parse(outdated || "{}");

      if (Object.keys(outdatedPackages).length === 0) {
        this.logger.info("✅ All dependencies are up to date");
        return;
      }

      console.log("\n📊 Outdated packages:");
      for (const [pkg, info] of Object.entries(outdatedPackages)) {
        console.log(
          `  ${pkg}: ${info.current} → ${info.wanted} (latest: ${info.latest})`,
        );
      }

      // Update dependencies
      this.logger.info("Updating dependencies...");
      this.execCommand("npm update");

      // Run security audit
      this.logger.info("Running security audit...");
      try {
        this.execCommand("npm audit fix");
      } catch (error) {
        this.logger.warn("Some security issues could not be auto-fixed");
      }

      this.logger.info("✅ Dependencies updated successfully");
    } catch (error) {
      this.logger.error("Failed to update dependencies", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Generate project report
   */
  async generateReport() {
    this.logger.info("📊 Generating project report...");

    const report = {
      timestamp: new Date().toISOString(),
      project: {
        name: this.packageJson.name || "Unknown",
        version: this.packageJson.version || "0.0.0",
        description: this.packageJson.description || "",
      },
      dependencies: this.analyzeDependencies(),
      codeStats: this.analyzeCodebase(),
      gitStats: this.analyzeGitHistory(),
    };

    // Save report
    const reportPath = path.join(this.rootDir, "project-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    this.logger.info(`📄 Report saved to: ${reportPath}`);

    // Print summary
    this.printReportSummary(report);
  }

  /**
   * Analyze dependencies
   * @returns {Object} Dependency analysis
   */
  analyzeDependencies() {
    const deps = this.packageJson.dependencies || {};
    const devDeps = this.packageJson.devDependencies || {};

    return {
      production: Object.keys(deps).length,
      development: Object.keys(devDeps).length,
      total: Object.keys(deps).length + Object.keys(devDeps).length,
      engines: this.packageJson.engines || {},
    };
  }

  /**
   * Analyze codebase
   * @returns {Object} Code analysis
   */
  analyzeCodebase() {
    const srcDir = path.join(this.rootDir, "src");
    const testDir = path.join(this.rootDir, "__tests__");

    const countFiles = (dir) => {
      if (!fs.existsSync(dir)) return { files: 0, lines: 0 };

      let files = 0;
      let lines = 0;

      const scan = (currentDir) => {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            scan(fullPath);
          } else if (entry.name.endsWith(".js")) {
            files++;
            try {
              const content = fs.readFileSync(fullPath, "utf8");
              lines += content.split("\n").length;
            } catch (error) {
              // Ignore files that can't be read
            }
          }
        }
      };

      scan(dir);
      return { files, lines };
    };

    const sourceStats = countFiles(srcDir);
    const testStats = countFiles(testDir);

    return {
      source: sourceStats,
      tests: testStats,
      testCoverage:
        testStats.files > 0
          ? Math.round((testStats.files / sourceStats.files) * 100)
          : 0,
    };
  }

  /**
   * Analyze git history
   * @returns {Object} Git analysis
   */
  analyzeGitHistory() {
    try {
      const commitCount = this.execCommand("git rev-list --count HEAD", {
        stdio: "pipe",
      }).trim();
      const lastCommit = this.execCommand(
        'git log -1 --format="%H %s %an %ad" --date=iso',
        { stdio: "pipe" },
      ).trim();
      const branches = this.execCommand("git branch -r", { stdio: "pipe" })
        .split("\n")
        .filter((b) => b.trim()).length;

      return {
        commits: parseInt(commitCount),
        lastCommit: lastCommit,
        branches: branches,
      };
    } catch (error) {
      return {
        commits: 0,
        lastCommit: "No git repository",
        branches: 0,
      };
    }
  }

  /**
   * Print report summary
   * @param {Object} report - Project report
   */
  printReportSummary(report) {
    console.log("\n" + "=".repeat(60));
    console.log("📊 PROJECT REPORT SUMMARY");
    console.log("=".repeat(60));

    console.log(`Project: ${report.project.name} v${report.project.version}`);
    console.log(`Generated: ${new Date(report.timestamp).toLocaleString()}`);
    console.log("");

    console.log("📦 Dependencies:");
    console.log(`  Production: ${report.dependencies.production}`);
    console.log(`  Development: ${report.dependencies.development}`);
    console.log(`  Total: ${report.dependencies.total}`);
    console.log("");

    console.log("💻 Codebase:");
    console.log(
      `  Source files: ${report.codeStats.source.files} (${report.codeStats.source.lines} lines)`,
    );
    console.log(
      `  Test files: ${report.codeStats.tests.files} (${report.codeStats.tests.lines} lines)`,
    );
    console.log(
      `  Test coverage: ${report.codeStats.testCoverage}% files covered`,
    );
    console.log("");

    console.log("🔄 Git Repository:");
    console.log(`  Commits: ${report.gitStats.commits}`);
    console.log(`  Branches: ${report.gitStats.branches}`);
    console.log(
      `  Last commit: ${report.gitStats.lastCommit.split(" ").slice(1, 3).join(" ")}`,
    );

    console.log("\n" + "=".repeat(60) + "\n");
  }

  /**
   * Interactive development menu
   */
  async interactiveMenu() {
    const readline = require("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const question = (prompt) =>
      new Promise((resolve) => rl.question(prompt, resolve));

    console.log("\n🛠️  RAG Pipeline Utils - Developer Tools");
    console.log("==========================================");
    console.log("1. Health Check");
    console.log("2. Setup Development Environment");
    console.log("3. Clean Project");
    console.log("4. Update Dependencies");
    console.log("5. Generate Project Report");
    console.log("6. Generate Documentation");
    console.log("7. Run Benchmarks");
    console.log("0. Exit");

    try {
      const choice = await question("\nSelect an option (0-7): ");

      switch (choice.trim()) {
        case "1":
          await this.healthCheck();
          break;
        case "2":
          await this.setupDev();
          break;
        case "3":
          await this.clean();
          break;
        case "4":
          await this.updateDeps();
          break;
        case "5":
          await this.generateReport();
          break;
        case "6":
          this.logger.info("Generating documentation...");
          this.execCommand("node scripts/generate-docs.js --verbose");
          break;
        case "7":
          this.logger.info("Running benchmarks...");
          this.execCommand("node scripts/benchmark.js --iterations 50");
          break;
        case "0":
          this.logger.info("👋 Goodbye!");
          break;
        default:
          this.logger.warn("Invalid option selected");
      }
    } catch (error) {
      this.logger.error("Menu operation failed", { error: error.message });
    } finally {
      rl.close();
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const options = {
    verbose: args.includes("--verbose") || args.includes("-v"),
  };

  const tools = new DeveloperTools(options);

  switch (command) {
    case "health":
      tools.healthCheck().catch(console.error);
      break;
    case "setup":
      tools.setupDev().catch(console.error);
      break;
    case "clean":
      tools.clean().catch(console.error);
      break;
    case "update":
      tools.updateDeps().catch(console.error);
      break;
    case "report":
      tools.generateReport().catch(console.error);
      break;
    case "menu":
    case undefined:
      tools.interactiveMenu().catch(console.error);
      break;
    default:
      console.log("Usage: node scripts/dev-tools.js [command]");
      console.log("Commands: health, setup, clean, update, report, menu");
      console.log("Options: --verbose, -v");
  }
}

module.exports = {
  DeveloperTools,
};
