/**
 * Security Audit Script - Enterprise Audit
 * Reviews security posture, supply chain, and vulnerability management
 * Following ESLint standards established in project memory
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

class SecurityAuditor {
  constructor(rootPath) {
    this.rootPath = rootPath;
    this.results = {
      metadata: {
        timestamp: new Date().toISOString(),
        auditDuration: 0,
      },
      npmAudit: {
        executed: false,
        exitCode: null,
        vulnerabilities: {
          info: 0,
          low: 0,
          moderate: 0,
          high: 0,
          critical: 0,
        },
        totalVulnerabilities: 0,
        advisories: [],
      },
      supplyChain: {
        packageCount: 0,
        licenseCompliance: [],
        outdatedPackages: [],
        unpinnedDependencies: [],
      },
      secretsHygiene: {
        potentialSecrets: [],
        configurationIssues: [],
      },
      securityFiles: {
        securityPolicy: false,
        codeOfConduct: false,
        contributing: false,
        license: false,
      },
      dockerSecurity: {
        dockerfiles: [],
        securityIssues: [],
      },
      overallRisk: "unknown",
    };
  }

  /**
   * Execute comprehensive security audit
   */
  async executeSecurityAudit() {
    console.log("🔒 Starting security audit...");
    const startTime = Date.now();

    // Run npm audit
    await this.runNpmAudit();

    // Analyze package.json for supply chain issues
    await this.analyzeSupplyChain();

    // Scan for secrets and sensitive data
    await this.scanForSecrets();

    // Check security-related files
    await this.checkSecurityFiles();

    // Analyze Docker configurations
    await this.analyzeDockerSecurity();

    // Calculate overall risk assessment
    this.calculateOverallRisk();

    this.results.metadata.auditDuration = Date.now() - startTime;

    console.log("✅ Security audit complete");
    return this.results;
  }

  /**
   * Run npm audit and parse results
   */
  async runNpmAudit() {
    console.log("📦 Running npm audit...");

    return new Promise((resolve) => {
      const auditProcess = spawn("npm", ["audit", "--json"], {
        cwd: this.rootPath,
        stdio: "pipe",
        shell: true,
      });

      let stdout = "";
      let stderr = "";

      auditProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      auditProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      auditProcess.on("close", (code) => {
        this.results.npmAudit.executed = true;
        this.results.npmAudit.exitCode = code;

        try {
          if (stdout.trim()) {
            const auditData = JSON.parse(stdout);
            this.parseNpmAuditResults(auditData);
          }
        } catch (error) {
          console.warn("Could not parse npm audit JSON:", error.message);
          // Try to parse text output
          this.parseNpmAuditText(stdout + stderr);
        }

        console.log(
          `📊 npm audit: ${this.results.npmAudit.totalVulnerabilities} vulnerabilities found`,
        );
        resolve();
      });

      auditProcess.on("error", (error) => {
        console.warn("npm audit process error:", error.message);
        resolve();
      });
    });
  }

  /**
   * Parse npm audit JSON results
   */
  parseNpmAuditResults(auditData) {
    if (auditData.vulnerabilities) {
      for (const [packageName, vulnerability] of Object.entries(
        auditData.vulnerabilities,
      )) {
        const severity = vulnerability.severity;
        if (this.results.npmAudit.vulnerabilities[severity] !== undefined) {
          this.results.npmAudit.vulnerabilities[severity]++;
        }

        this.results.npmAudit.advisories.push({
          package: packageName,
          severity: severity,
          title: vulnerability.title || "Unknown vulnerability",
          url: vulnerability.url,
          range: vulnerability.range,
        });
      }
    }

    // Calculate total
    this.results.npmAudit.totalVulnerabilities = Object.values(
      this.results.npmAudit.vulnerabilities,
    ).reduce((sum, count) => sum + count, 0);
  }

  /**
   * Parse npm audit text output as fallback
   */
  parseNpmAuditText(output) {
    const lines = output.split("\n");
    let vulnerabilityCount = 0;

    for (const line of lines) {
      if (line.includes("vulnerabilities") || line.includes("vulnerability")) {
        const match = line.match(/(\d+)/);
        if (match) {
          vulnerabilityCount += parseInt(match[1]);
        }
      }
    }

    this.results.npmAudit.totalVulnerabilities = vulnerabilityCount;
  }

  /**
   * Analyze supply chain security
   */
  async analyzeSupplyChain() {
    console.log("🔗 Analyzing supply chain...");

    try {
      const packageJsonPath = path.join(this.rootPath, "package.json");
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, "utf8"),
        );

        // Count dependencies
        const deps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };
        this.results.supplyChain.packageCount = Object.keys(deps).length;

        // Check for unpinned dependencies
        for (const [name, version] of Object.entries(deps)) {
          if (
            version.startsWith("^") ||
            version.startsWith("~") ||
            version === "*"
          ) {
            this.results.supplyChain.unpinnedDependencies.push({
              package: name,
              version: version,
              risk: "version_drift",
            });
          }
        }

        // Check license
        if (packageJson.license) {
          this.results.supplyChain.licenseCompliance.push({
            type: "main_package",
            license: packageJson.license,
            compliant: this.isLicenseCompliant(packageJson.license),
          });
        }
      }

      // Check package-lock.json for exact versions
      const lockPath = path.join(this.rootPath, "package-lock.json");
      if (fs.existsSync(lockPath)) {
        console.log(
          "✅ package-lock.json found - dependency versions are locked",
        );
      } else {
        this.results.supplyChain.unpinnedDependencies.push({
          package: "lockfile",
          version: "missing",
          risk: "no_lockfile",
        });
      }
    } catch (error) {
      console.warn("Could not analyze supply chain:", error.message);
    }
  }

  /**
   * Check if license is compliant with common enterprise policies
   */
  isLicenseCompliant(license) {
    const compliantLicenses = [
      "MIT",
      "Apache-2.0",
      "BSD-3-Clause",
      "BSD-2-Clause",
      "ISC",
    ];
    return compliantLicenses.includes(license);
  }

  /**
   * Scan for potential secrets and sensitive data
   */
  async scanForSecrets() {
    console.log("🔍 Scanning for secrets...");

    const secretPatterns = [
      {
        name: "API Key",
        pattern:
          /[aA][pP][iI][_\s]*[kK][eE][yY][_\s]*[:=]\s*['"]?[a-zA-Z0-9]{20,}['"]?/,
      },
      { name: "AWS Access Key", pattern: /AKIA[0-9A-Z]{16}/ },
      { name: "Private Key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
      {
        name: "JWT Token",
        pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/,
      },
      {
        name: "Password",
        pattern:
          /[pP][aA][sS][sS][wW][oO][rR][dD][_\s]*[:=]\s*['"]?[a-zA-Z0-9!@#$%^&*]{8,}['"]?/,
      },
      {
        name: "Database URL",
        pattern:
          /[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[a-zA-Z0-9._-]+:[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+/,
      },
    ];

    const filesToScan = this.findFilesToScan();

    for (const filePath of filesToScan) {
      try {
        const content = fs.readFileSync(filePath, "utf8");
        const relativePath = path.relative(this.rootPath, filePath);

        for (const { name, pattern } of secretPatterns) {
          const matches = content.match(pattern);
          if (matches) {
            this.results.secretsHygiene.potentialSecrets.push({
              file: relativePath,
              type: name,
              line: this.findLineNumber(content, matches[0]),
              severity: this.getSecretSeverity(name),
            });
          }
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }

    console.log(
      `🔍 Found ${this.results.secretsHygiene.potentialSecrets.length} potential secrets`,
    );
  }

  /**
   * Find files to scan for secrets
   */
  findFilesToScan() {
    const files = [];
    const extensions = [
      ".js",
      ".ts",
      ".json",
      ".env",
      ".yml",
      ".yaml",
      ".md",
      ".txt",
    ];
    const excludeDirs = ["node_modules", ".git", "dist", "build"];

    const walkDir = (dirPath) => {
      try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const item of items) {
          const itemPath = path.join(dirPath, item.name);

          if (item.isDirectory() && !excludeDirs.includes(item.name)) {
            walkDir(itemPath);
          } else if (item.isFile()) {
            const ext = path.extname(item.name);
            if (extensions.includes(ext) || item.name.startsWith(".env")) {
              files.push(itemPath);
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be read
      }
    };

    walkDir(this.rootPath);
    return files;
  }

  /**
   * Find line number of match in content
   */
  findLineNumber(content, match) {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(match)) {
        return i + 1;
      }
    }
    return 1;
  }

  /**
   * Get severity level for secret type
   */
  getSecretSeverity(secretType) {
    const highSeverity = ["Private Key", "AWS Access Key", "API Key"];
    const mediumSeverity = ["JWT Token", "Database URL"];

    if (highSeverity.includes(secretType)) return "high";
    if (mediumSeverity.includes(secretType)) return "medium";
    return "low";
  }

  /**
   * Check for security-related files
   */
  async checkSecurityFiles() {
    console.log("📋 Checking security files...");

    const securityFiles = {
      "SECURITY.md": "securityPolicy",
      "CODE_OF_CONDUCT.md": "codeOfConduct",
      "CONTRIBUTING.md": "contributing",
      LICENSE: "license",
      "LICENSE.md": "license",
      "LICENSE.txt": "license",
    };

    for (const [fileName, property] of Object.entries(securityFiles)) {
      const filePath = path.join(this.rootPath, fileName);
      if (fs.existsSync(filePath)) {
        this.results.securityFiles[property] = true;
      }
    }
  }

  /**
   * Analyze Docker security configurations
   */
  async analyzeDockerSecurity() {
    console.log("🐳 Analyzing Docker security...");

    const dockerFiles = [
      "Dockerfile",
      "docker-compose.yml",
      "docker-compose.yaml",
    ];

    for (const fileName of dockerFiles) {
      const filePath = path.join(this.rootPath, fileName);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf8");
        const analysis = this.analyzeDockerFile(fileName, content);
        this.results.dockerSecurity.dockerfiles.push(analysis);
      }
    }
  }

  /**
   * Analyze individual Docker file
   */
  analyzeDockerFile(fileName, content) {
    const analysis = {
      file: fileName,
      issues: [],
      recommendations: [],
    };

    // Check for common security issues
    if (content.includes("USER root") || !content.includes("USER ")) {
      analysis.issues.push({
        type: "privileged_user",
        severity: "high",
        message: "Container runs as root user - security risk",
      });
    }

    if (content.includes("ADD ") && content.includes("http")) {
      analysis.issues.push({
        type: "remote_add",
        severity: "medium",
        message: "ADD instruction with remote URL - use COPY instead",
      });
    }

    if (!content.includes("HEALTHCHECK")) {
      analysis.recommendations.push({
        type: "healthcheck",
        message: "Consider adding HEALTHCHECK instruction",
      });
    }

    return analysis;
  }

  /**
   * Calculate overall risk assessment
   */
  calculateOverallRisk() {
    let riskScore = 0;

    // npm audit vulnerabilities
    riskScore += this.results.npmAudit.vulnerabilities.critical * 10;
    riskScore += this.results.npmAudit.vulnerabilities.high * 5;
    riskScore += this.results.npmAudit.vulnerabilities.moderate * 2;
    riskScore += this.results.npmAudit.vulnerabilities.low * 1;

    // Secrets
    const highSecrets = this.results.secretsHygiene.potentialSecrets.filter(
      (s) => s.severity === "high",
    ).length;
    riskScore += highSecrets * 8;

    // Supply chain
    riskScore += this.results.supplyChain.unpinnedDependencies.length * 1;

    // Docker issues
    const dockerHighIssues = this.results.dockerSecurity.dockerfiles.reduce(
      (sum, df) => sum + df.issues.filter((i) => i.severity === "high").length,
      0,
    );
    riskScore += dockerHighIssues * 3;

    // Determine risk level
    if (riskScore >= 20) {
      this.results.overallRisk = "high";
    } else if (riskScore >= 10) {
      this.results.overallRisk = "medium";
    } else if (riskScore >= 5) {
      this.results.overallRisk = "low";
    } else {
      this.results.overallRisk = "minimal";
    }
  }

  /**
   * Generate security audit report
   */
  generateSecurityReport() {
    const report = `# Security Audit Report

## Executive Summary

- **Overall Risk Level:** ${this.results.overallRisk.toUpperCase()} ${this.getRiskEmoji(this.results.overallRisk)}
- **Audit Duration:** ${this.results.metadata.auditDuration}ms
- **Total Vulnerabilities:** ${this.results.npmAudit.totalVulnerabilities}
- **Potential Secrets Found:** ${this.results.secretsHygiene.potentialSecrets.length}
- **Supply Chain Packages:** ${this.results.supplyChain.packageCount}

## Vulnerability Assessment (npm audit)

${
  this.results.npmAudit.executed
    ? `
- **Critical:** ${this.results.npmAudit.vulnerabilities.critical} ${this.results.npmAudit.vulnerabilities.critical === 0 ? "✅" : "❌"}
- **High:** ${this.results.npmAudit.vulnerabilities.high} ${this.results.npmAudit.vulnerabilities.high === 0 ? "✅" : "⚠️"}
- **Moderate:** ${this.results.npmAudit.vulnerabilities.moderate}
- **Low:** ${this.results.npmAudit.vulnerabilities.low}
- **Info:** ${this.results.npmAudit.vulnerabilities.info}

${
  this.results.npmAudit.advisories.length > 0
    ? `### Top Vulnerabilities

${this.results.npmAudit.advisories
  .slice(0, 5)
  .map(
    (advisory) =>
      `- **${advisory.package}** (${advisory.severity}): ${advisory.title}`,
  )
  .join("\n")}
${this.results.npmAudit.advisories.length > 5 ? `\n... and ${this.results.npmAudit.advisories.length - 5} more vulnerabilities` : ""}
`
    : ""
}
`
    : "⚠️ npm audit could not be executed"
}

## Supply Chain Security

- **Total Dependencies:** ${this.results.supplyChain.packageCount}
- **Unpinned Dependencies:** ${this.results.supplyChain.unpinnedDependencies.length} ${this.results.supplyChain.unpinnedDependencies.length === 0 ? "✅" : "⚠️"}
- **License Compliance:** ${this.results.supplyChain.licenseCompliance.length > 0 ? (this.results.supplyChain.licenseCompliance[0].compliant ? "✅" : "⚠️") : "❓"}

${
  this.results.supplyChain.unpinnedDependencies.length > 0
    ? `### Unpinned Dependencies

${this.results.supplyChain.unpinnedDependencies
  .slice(0, 10)
  .map((dep) => `- **${dep.package}**: ${dep.version} (${dep.risk})`)
  .join("\n")}
${this.results.supplyChain.unpinnedDependencies.length > 10 ? `\n... and ${this.results.supplyChain.unpinnedDependencies.length - 10} more` : ""}
`
    : ""
}

## Secrets & Sensitive Data

- **Potential Secrets Found:** ${this.results.secretsHygiene.potentialSecrets.length} ${this.results.secretsHygiene.potentialSecrets.length === 0 ? "✅" : "❌"}

${
  this.results.secretsHygiene.potentialSecrets.length > 0
    ? `### Detected Secrets

${this.results.secretsHygiene.potentialSecrets
  .map(
    (secret) =>
      `- **${secret.file}:${secret.line}** - ${secret.type} (${secret.severity})`,
  )
  .join("\n")}
`
    : ""
}

## Security Files Compliance

- **Security Policy (SECURITY.md):** ${this.results.securityFiles.securityPolicy ? "✅" : "❌"}
- **Code of Conduct:** ${this.results.securityFiles.codeOfConduct ? "✅" : "❌"}
- **Contributing Guidelines:** ${this.results.securityFiles.contributing ? "✅" : "❌"}
- **License:** ${this.results.securityFiles.license ? "✅" : "❌"}

## Docker Security

${
  this.results.dockerSecurity.dockerfiles.length > 0
    ? `
**Docker Files Analyzed:** ${this.results.dockerSecurity.dockerfiles.length}

${this.results.dockerSecurity.dockerfiles
  .map(
    (dockerfile) => `### ${dockerfile.file}

${
  dockerfile.issues.length > 0
    ? `**Issues:**
${dockerfile.issues.map((issue) => `- **${issue.severity.toUpperCase()}:** ${issue.message}`).join("\n")}
`
    : "✅ No security issues found"
}

${
  dockerfile.recommendations.length > 0
    ? `**Recommendations:**
${dockerfile.recommendations.map((rec) => `- ${rec.message}`).join("\n")}
`
    : ""
}
`,
  )
  .join("\n")}
`
    : "✅ No Docker files found"
}

## Risk Assessment

**Overall Risk Level: ${this.results.overallRisk.toUpperCase()}** ${this.getRiskEmoji(this.results.overallRisk)}

### Risk Factors:
- **Critical Vulnerabilities:** ${this.results.npmAudit.vulnerabilities.critical > 0 ? "❌ Present" : "✅ None"}
- **High-Severity Secrets:** ${this.results.secretsHygiene.potentialSecrets.filter((s) => s.severity === "high").length > 0 ? "❌ Detected" : "✅ None"}
- **Supply Chain Hygiene:** ${this.results.supplyChain.unpinnedDependencies.length > 10 ? "⚠️ Needs Attention" : "✅ Good"}
- **Security Documentation:** ${Object.values(this.results.securityFiles).filter(Boolean).length >= 2 ? "✅ Adequate" : "⚠️ Incomplete"}

## Recommendations

${this.generateRecommendations()
  .map((rec, index) => `${index + 1}. ${rec}`)
  .join("\n")}

## Next Steps

1. **Immediate:** Address any critical vulnerabilities and high-severity secrets
2. **Short-term:** Implement missing security files and fix moderate issues
3. **Long-term:** Establish security monitoring and regular audit processes
`;

    return report;
  }

  /**
   * Get risk emoji
   */
  getRiskEmoji(risk) {
    const emojis = {
      minimal: "✅",
      low: "🟡",
      medium: "🟠",
      high: "🔴",
    };
    return emojis[risk] || "❓";
  }

  /**
   * Generate actionable recommendations
   */
  generateRecommendations() {
    const recommendations = [];

    if (this.results.npmAudit.vulnerabilities.critical > 0) {
      recommendations.push(
        "**URGENT:** Fix critical npm vulnerabilities using `npm audit fix`",
      );
    }

    if (
      this.results.secretsHygiene.potentialSecrets.filter(
        (s) => s.severity === "high",
      ).length > 0
    ) {
      recommendations.push(
        "**URGENT:** Remove or secure high-severity secrets detected in codebase",
      );
    }

    if (!this.results.securityFiles.securityPolicy) {
      recommendations.push(
        "Create SECURITY.md file with vulnerability reporting process",
      );
    }

    if (this.results.supplyChain.unpinnedDependencies.length > 5) {
      recommendations.push(
        "Pin dependency versions and maintain package-lock.json",
      );
    }

    if (this.results.npmAudit.vulnerabilities.high > 0) {
      recommendations.push("Address high-severity npm vulnerabilities");
    }

    if (!this.results.securityFiles.license) {
      recommendations.push("Add LICENSE file for legal compliance");
    }

    return recommendations;
  }

  /**
   * Execute security audit and generate reports
   */
  async executeSecurityAuditWithReports() {
    const results = await this.executeSecurityAudit();

    // Ensure output directory exists
    const reportsDir = path.join(this.rootPath, "ci-reports");
    const docsDir = path.join(this.rootPath, "docs");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    // Write JSON results
    if (results.npmAudit.executed) {
      fs.writeFileSync(
        path.join(reportsDir, "npm-audit.json"),
        JSON.stringify(results.npmAudit, null, 2),
      );
    }

    // Write security report
    const securityReport = this.generateSecurityReport();
    fs.writeFileSync(path.join(docsDir, "SECURITY_AUDIT.md"), securityReport);

    console.log("📁 Generated: docs/SECURITY_AUDIT.md");
    if (results.npmAudit.executed) {
      console.log("📁 Generated: ci-reports/npm-audit.json");
    }

    return results;
  }
}

// Execute if run directly
if (require.main === module) {
  const auditor = new SecurityAuditor(process.cwd());
  auditor
    .executeSecurityAuditWithReports()
    .then((results) => {
      console.log(`🎯 Security Risk: ${results.overallRisk.toUpperCase()}`);
      console.log(
        `🎯 Vulnerabilities: ${results.npmAudit.totalVulnerabilities}`,
      );
      console.log(
        `🎯 Potential Secrets: ${results.secretsHygiene.potentialSecrets.length}`,
      );
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Security audit failed:", error);
      process.exit(1);
    });
}

module.exports = { SecurityAuditor };
