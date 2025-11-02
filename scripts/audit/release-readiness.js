/**
 * Release Readiness Audit Script - Enterprise Audit
 * Validates package.json and npm pack readiness
 * Following ESLint standards established in project memory
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

class ReleaseReadinessAuditor {
  constructor(rootPath) {
    this.rootPath = rootPath;
    this.results = {
      metadata: {
        timestamp: new Date().toISOString(),
        auditDuration: 0,
      },
      packageJson: {
        exists: false,
        valid: false,
        requiredFields: {},
        optionalFields: {},
        issues: [],
        recommendations: [],
      },
      npmPack: {
        executed: false,
        exitCode: null,
        files: [],
        totalSize: 0,
        issues: [],
      },
      releaseReadiness: {
        score: 0,
        status: "not_ready",
        blockers: [],
        warnings: [],
      },
    };
  }

  /**
   * Execute release readiness audit
   */
  async executeReleaseAudit() {
    console.log("📦 Starting release readiness audit...");
    const startTime = Date.now();

    // Analyze package.json
    await this.analyzePackageJson();

    // Run npm pack dry-run
    await this.runNpmPackDryRun();

    // Calculate readiness score
    this.calculateReadinessScore();

    this.results.metadata.auditDuration = Date.now() - startTime;

    console.log("✅ Release readiness audit complete");
    return this.results;
  }

  /**
   * Analyze package.json for completeness and validity
   */
  async analyzePackageJson() {
    console.log("📋 Analyzing package.json...");

    const packageJsonPath = path.join(this.rootPath, "package.json");

    if (!fs.existsSync(packageJsonPath)) {
      this.results.packageJson.exists = false;
      this.results.releaseReadiness.blockers.push({
        type: "missing_package_json",
        severity: "critical",
        message: "package.json file not found",
      });
      return;
    }

    this.results.packageJson.exists = true;

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      this.results.packageJson.valid = true;

      // Check required fields
      const requiredFields = {
        name: "Package name",
        version: "Package version",
        description: "Package description",
        main: "Main entry point",
        license: "License information",
      };

      for (const [field, description] of Object.entries(requiredFields)) {
        const exists = packageJson[field] !== undefined;
        this.results.packageJson.requiredFields[field] = {
          exists,
          value: exists ? packageJson[field] : null,
          description,
        };

        if (!exists) {
          this.results.releaseReadiness.blockers.push({
            type: "missing_required_field",
            field,
            severity: "high",
            message: `Missing required field: ${field} (${description})`,
          });
        }
      }

      // Check optional but recommended fields
      const optionalFields = {
        author: "Package author",
        repository: "Repository information",
        keywords: "Search keywords",
        homepage: "Project homepage",
        bugs: "Bug reporting URL",
        engines: "Node.js version requirements",
        files: "Files to include in package",
        scripts: "npm scripts",
        bin: "Binary executables",
        exports: "Module exports map",
        publishConfig: "Publishing configuration",
      };

      for (const [field, description] of Object.entries(optionalFields)) {
        const exists = packageJson[field] !== undefined;
        this.results.packageJson.optionalFields[field] = {
          exists,
          value: exists ? packageJson[field] : null,
          description,
        };

        if (!exists) {
          this.results.releaseReadiness.warnings.push({
            type: "missing_optional_field",
            field,
            severity: "low",
            message: `Consider adding ${field} (${description})`,
          });
        }
      }

      // Validate specific fields
      this.validatePackageJsonFields(packageJson);
    } catch (error) {
      this.results.packageJson.valid = false;
      this.results.releaseReadiness.blockers.push({
        type: "invalid_package_json",
        severity: "critical",
        message: `Invalid package.json: ${error.message}`,
      });
    }
  }

  /**
   * Validate specific package.json fields
   */
  validatePackageJsonFields(packageJson) {
    // Validate version format
    if (packageJson.version) {
      const semverPattern =
        /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
      if (!semverPattern.test(packageJson.version)) {
        this.results.packageJson.issues.push({
          field: "version",
          type: "invalid_format",
          message:
            "Version does not follow semantic versioning (semver) format",
        });
      }
    }

    // Validate name format
    if (packageJson.name) {
      const namePattern =
        /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
      if (!namePattern.test(packageJson.name)) {
        this.results.packageJson.issues.push({
          field: "name",
          type: "invalid_format",
          message: "Package name contains invalid characters",
        });
      }
    }

    // Validate main file exists
    if (packageJson.main) {
      const mainPath = path.resolve(this.rootPath, packageJson.main);
      if (!fs.existsSync(mainPath)) {
        this.results.packageJson.issues.push({
          field: "main",
          type: "file_not_found",
          message: `Main entry point file not found: ${packageJson.main}`,
        });
      }
    }

    // Validate bin files exist
    if (packageJson.bin) {
      const binEntries =
        typeof packageJson.bin === "string"
          ? { [packageJson.name]: packageJson.bin }
          : packageJson.bin;

      for (const [binName, binPath] of Object.entries(binEntries)) {
        const fullBinPath = path.resolve(this.rootPath, binPath);
        if (!fs.existsSync(fullBinPath)) {
          this.results.packageJson.issues.push({
            field: "bin",
            type: "file_not_found",
            message: `Binary file not found: ${binPath} (${binName})`,
          });
        }
      }
    }

    // Validate repository format
    if (packageJson.repository) {
      if (typeof packageJson.repository === "string") {
        if (
          !packageJson.repository.includes("github.com") &&
          !packageJson.repository.includes("gitlab.com")
        ) {
          this.results.releaseReadiness.warnings.push({
            type: "repository_format",
            severity: "low",
            message: "Repository should be an object with type and url fields",
          });
        }
      } else if (typeof packageJson.repository === "object") {
        if (!packageJson.repository.type || !packageJson.repository.url) {
          this.results.packageJson.issues.push({
            field: "repository",
            type: "incomplete_object",
            message: "Repository object should have type and url fields",
          });
        }
      }
    }

    // Check for common security issues
    if (packageJson.scripts) {
      for (const [scriptName, scriptCommand] of Object.entries(
        packageJson.scripts,
      )) {
        if (
          scriptCommand.includes("rm -rf") ||
          scriptCommand.includes("del /f")
        ) {
          this.results.packageJson.issues.push({
            field: "scripts",
            type: "security_risk",
            message: `Script '${scriptName}' contains potentially dangerous commands`,
          });
        }
      }
    }
  }

  /**
   * Run npm pack dry-run to see what would be included
   */
  async runNpmPackDryRun() {
    console.log("📦 Running npm pack dry-run...");

    return new Promise((resolve) => {
      const packProcess = spawn("npm", ["pack", "--dry-run"], {
        cwd: this.rootPath,
        stdio: "pipe",
        shell: true,
      });

      let stdout = "";
      let stderr = "";

      packProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      packProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      packProcess.on("close", (code) => {
        this.results.npmPack.executed = true;
        this.results.npmPack.exitCode = code;

        if (code === 0) {
          this.parseNpmPackOutput(stdout);
        } else {
          this.results.releaseReadiness.blockers.push({
            type: "npm_pack_failed",
            severity: "high",
            message: `npm pack failed with exit code ${code}: ${stderr}`,
          });
        }

        console.log(
          `📊 npm pack: ${this.results.npmPack.files.length} files, ${this.results.npmPack.totalSize} bytes`,
        );
        resolve();
      });

      packProcess.on("error", (error) => {
        console.warn("npm pack process error:", error.message);
        this.results.npmPack.issues.push({
          type: "process_error",
          message: error.message,
        });
        resolve();
      });
    });
  }

  /**
   * Parse npm pack output to extract file list
   */
  parseNpmPackOutput(output) {
    const lines = output.split("\n");
    let inFileList = false;
    let totalSize = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Look for file listing section
      if (trimmedLine.includes("npm notice") && trimmedLine.includes("files")) {
        inFileList = true;
        continue;
      }

      // Parse file entries
      if (inFileList && trimmedLine.startsWith("npm notice")) {
        const fileMatch = trimmedLine.match(
          /npm notice\s+(\d+(?:\.\d+)?[kMG]?B?)\s+(.+)/,
        );
        if (fileMatch) {
          const size = this.parseSize(fileMatch[1]);
          const filePath = fileMatch[2];

          this.results.npmPack.files.push({
            path: filePath,
            size: size,
          });

          totalSize += size;
        }
      }

      // Look for total size
      const totalMatch = trimmedLine.match(
        /npm notice\s+===\s+Tarball Details\s+===|npm notice\s+package size:\s+(\d+(?:\.\d+)?[kMG]?B?)/,
      );
      if (totalMatch && totalMatch[1]) {
        totalSize = this.parseSize(totalMatch[1]);
      }
    }

    this.results.npmPack.totalSize = totalSize;

    // Analyze included files
    this.analyzePackageContents();
  }

  /**
   * Parse size string to bytes
   */
  parseSize(sizeStr) {
    const match = sizeStr.match(/^(\d+(?:\.\d+)?)([kMG]?B?)$/);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2];

    switch (unit) {
      case "GB":
        return value * 1024 * 1024 * 1024;
      case "MB":
        return value * 1024 * 1024;
      case "kB":
      case "KB":
        return value * 1024;
      default:
        return value;
    }
  }

  /**
   * Analyze package contents for issues
   */
  analyzePackageContents() {
    const files = this.results.npmPack.files;

    // Check for common issues
    const hasReadme = files.some((f) =>
      f.path.toLowerCase().includes("readme"),
    );
    const hasLicense = files.some((f) =>
      f.path.toLowerCase().includes("license"),
    );
    const hasTests = files.some(
      (f) => f.path.includes("test") || f.path.includes("spec"),
    );
    const hasNodeModules = files.some((f) => f.path.includes("node_modules"));
    const hasDotFiles = files.some(
      (f) =>
        path.basename(f.path).startsWith(".") && !f.path.includes("gitignore"),
    );

    if (!hasReadme) {
      this.results.releaseReadiness.warnings.push({
        type: "missing_readme",
        severity: "medium",
        message: "No README file included in package",
      });
    }

    if (!hasLicense) {
      this.results.releaseReadiness.warnings.push({
        type: "missing_license",
        severity: "medium",
        message: "No LICENSE file included in package",
      });
    }

    if (hasTests) {
      this.results.npmPack.issues.push({
        type: "includes_tests",
        severity: "low",
        message:
          "Test files are included in package - consider excluding with .npmignore",
      });
    }

    if (hasNodeModules) {
      this.results.npmPack.issues.push({
        type: "includes_node_modules",
        severity: "high",
        message:
          "node_modules directory included in package - add to .npmignore",
      });
    }

    if (hasDotFiles) {
      this.results.npmPack.issues.push({
        type: "includes_dotfiles",
        severity: "low",
        message:
          "Hidden files (dotfiles) included in package - consider excluding",
      });
    }

    // Check package size
    const sizeMB = this.results.npmPack.totalSize / (1024 * 1024);
    if (sizeMB > 10) {
      this.results.releaseReadiness.warnings.push({
        type: "large_package",
        severity: "medium",
        message: `Package size is ${sizeMB.toFixed(1)}MB - consider reducing size`,
      });
    }
  }

  /**
   * Calculate overall readiness score
   */
  calculateReadinessScore() {
    let score = 100;

    // Deduct for blockers
    for (const blocker of this.results.releaseReadiness.blockers) {
      switch (blocker.severity) {
        case "critical":
          score -= 30;
          break;
        case "high":
          score -= 20;
          break;
        case "medium":
          score -= 10;
          break;
        default:
          score -= 5;
      }
    }

    // Deduct for warnings
    for (const warning of this.results.releaseReadiness.warnings) {
      switch (warning.severity) {
        case "medium":
          score -= 5;
          break;
        case "low":
          score -= 2;
          break;
        default:
          score -= 1;
      }
    }

    // Deduct for package.json issues
    score -= this.results.packageJson.issues.length * 3;

    // Deduct for npm pack issues
    for (const issue of this.results.npmPack.issues) {
      switch (issue.severity) {
        case "high":
          score -= 15;
          break;
        case "medium":
          score -= 8;
          break;
        default:
          score -= 3;
      }
    }

    this.results.releaseReadiness.score = Math.max(0, score);

    // Determine status
    if (this.results.releaseReadiness.blockers.length > 0) {
      this.results.releaseReadiness.status = "blocked";
    } else if (score >= 90) {
      this.results.releaseReadiness.status = "ready";
    } else if (score >= 70) {
      this.results.releaseReadiness.status = "needs_improvement";
    } else {
      this.results.releaseReadiness.status = "not_ready";
    }
  }

  /**
   * Generate release readiness report
   */
  generateReadinessReport() {
    const report = `# Release Readiness Report

## Overall Assessment

- **Readiness Score:** ${this.results.releaseReadiness.score}/100
- **Status:** ${this.results.releaseReadiness.status.toUpperCase().replace("_", " ")} ${this.getStatusEmoji()}
- **Blockers:** ${this.results.releaseReadiness.blockers.length}
- **Warnings:** ${this.results.releaseReadiness.warnings.length}

## package.json Analysis

- **File Exists:** ${this.results.packageJson.exists ? "✅" : "❌"}
- **Valid JSON:** ${this.results.packageJson.valid ? "✅" : "❌"}
- **Issues Found:** ${this.results.packageJson.issues.length}

### Required Fields

${Object.entries(this.results.packageJson.requiredFields)
  .map(
    ([field, data]) =>
      `- **${field}** (${data.description}): ${data.exists ? "✅" : "❌"} ${data.exists ? `\`${data.value}\`` : ""}`,
  )
  .join("\n")}

### Optional Fields

${Object.entries(this.results.packageJson.optionalFields)
  .map(
    ([field, data]) =>
      `- **${field}** (${data.description}): ${data.exists ? "✅" : "⚪"} ${data.exists ? (typeof data.value === "object" ? "[Object]" : `\`${data.value}\``) : ""}`,
  )
  .join("\n")}

${
  this.results.packageJson.issues.length > 0
    ? `### package.json Issues

${this.results.packageJson.issues
  .map((issue) => `- **${issue.field}** (${issue.type}): ${issue.message}`)
  .join("\n")}
`
    : ""
}

## npm pack Analysis

- **Execution:** ${this.results.npmPack.executed ? (this.results.npmPack.exitCode === 0 ? "✅ Success" : "❌ Failed") : "⚪ Not executed"}
- **Files Included:** ${this.results.npmPack.files.length}
- **Package Size:** ${(this.results.npmPack.totalSize / 1024).toFixed(1)} KB
- **Issues:** ${this.results.npmPack.issues.length}

${
  this.results.npmPack.files.length > 0
    ? `### Package Contents

${this.results.npmPack.files
  .slice(0, 20)
  .map((file) => `- \`${file.path}\` (${(file.size / 1024).toFixed(1)} KB)`)
  .join("\n")}
${this.results.npmPack.files.length > 20 ? `\n... and ${this.results.npmPack.files.length - 20} more files` : ""}
`
    : ""
}

${
  this.results.npmPack.issues.length > 0
    ? `### Package Issues

${this.results.npmPack.issues
  .map(
    (issue) =>
      `- **${issue.severity ? issue.severity.toUpperCase() : "INFO"}:** ${issue.message}`,
  )
  .join("\n")}
`
    : ""
}

## Release Blockers

${
  this.results.releaseReadiness.blockers.length > 0
    ? `
${this.results.releaseReadiness.blockers
  .map(
    (blocker) => `- **${blocker.severity.toUpperCase()}:** ${blocker.message}`,
  )
  .join("\n")}
`
    : "✅ No release blockers found!"
}

## Warnings & Recommendations

${
  this.results.releaseReadiness.warnings.length > 0
    ? `
${this.results.releaseReadiness.warnings
  .map(
    (warning) =>
      `- **${warning.severity ? warning.severity.toUpperCase() : "INFO"}:** ${warning.message}`,
  )
  .join("\n")}
`
    : "✅ No warnings - package follows best practices!"
}

## Next Steps

${this.generateNextSteps()
  .map((step, index) => `${index + 1}. ${step}`)
  .join("\n")}

## Publishing Checklist

- [ ] All required package.json fields are present and valid
- [ ] Package builds successfully (\`npm run build\` if applicable)
- [ ] All tests pass (\`npm test\`)
- [ ] Documentation is up to date
- [ ] Version number follows semantic versioning
- [ ] CHANGELOG.md is updated (if applicable)
- [ ] No sensitive files are included in package
- [ ] Package size is reasonable (< 10MB recommended)
- [ ] License is specified and LICENSE file is included
- [ ] README.md provides clear installation and usage instructions

## Publication Command

Once all blockers are resolved:

\`\`\`bash
npm publish
\`\`\`

${
  this.results.packageJson.optionalFields.publishConfig?.exists
    ? "Note: Custom publishConfig detected - verify registry and access settings."
    : "Note: Will publish to default npm registry with default access settings."
}
`;

    return report;
  }

  /**
   * Get status emoji
   */
  getStatusEmoji() {
    const emojis = {
      ready: "✅",
      needs_improvement: "⚠️",
      not_ready: "❌",
      blocked: "🚫",
    };
    return emojis[this.results.releaseReadiness.status] || "❓";
  }

  /**
   * Generate next steps based on issues
   */
  generateNextSteps() {
    const steps = [];

    if (this.results.releaseReadiness.blockers.length > 0) {
      steps.push("**CRITICAL:** Resolve all release blockers listed above");
    }

    if (!this.results.packageJson.exists) {
      steps.push("Create package.json file with required fields");
    } else if (!this.results.packageJson.valid) {
      steps.push("Fix package.json syntax errors");
    }

    if (this.results.packageJson.issues.length > 0) {
      steps.push("Address package.json validation issues");
    }

    if (this.results.npmPack.issues.length > 0) {
      steps.push("Fix npm pack issues (check .npmignore file)");
    }

    if (this.results.releaseReadiness.warnings.length > 5) {
      steps.push("Address high-priority warnings for better package quality");
    }

    if (this.results.releaseReadiness.score < 80) {
      steps.push("Improve package metadata and documentation");
    }

    steps.push("Run final tests and build verification");
    steps.push("Update version number if needed");
    steps.push("Publish to npm registry");

    return steps;
  }

  /**
   * Execute release readiness audit and generate reports
   */
  async executeReleaseAuditWithReports() {
    const results = await this.executeReleaseAudit();

    // Ensure output directories exist
    const reportsDir = path.join(this.rootPath, "ci-reports");
    const docsDir = path.join(this.rootPath, "docs");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    // Write JSON results
    fs.writeFileSync(
      path.join(reportsDir, "npm-pack.json"),
      JSON.stringify(results.npmPack, null, 2),
    );

    // Write readiness report
    const readinessReport = this.generateReadinessReport();
    fs.writeFileSync(
      path.join(docsDir, "RELEASE_READINESS.md"),
      readinessReport,
    );

    console.log("📁 Generated: ci-reports/npm-pack.json");
    console.log("📁 Generated: docs/RELEASE_READINESS.md");

    return results;
  }
}

// Execute if run directly
if (require.main === module) {
  const auditor = new ReleaseReadinessAuditor(process.cwd());
  auditor
    .executeReleaseAuditWithReports()
    .then((results) => {
      console.log(
        `🎯 Release Readiness: ${results.releaseReadiness.status.toUpperCase()}`,
      );
      console.log(`🎯 Score: ${results.releaseReadiness.score}/100`);
      console.log(`🎯 Blockers: ${results.releaseReadiness.blockers.length}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Release readiness audit failed:", error);
      process.exit(1);
    });
}

module.exports = { ReleaseReadinessAuditor };
