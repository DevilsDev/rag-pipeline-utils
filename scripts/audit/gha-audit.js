/**
 * GitHub Actions Audit Script - Enterprise Audit
 * Reviews workflows for security, reliability, and best practices
 * Following ESLint standards established in project memory
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

class GitHubActionsAuditor {
  constructor(rootPath) {
    this.rootPath = rootPath;
    this.workflowsPath = path.join(rootPath, ".github", "workflows");
    this.results = {
      metadata: {
        timestamp: new Date().toISOString(),
        totalWorkflows: 0,
        auditedWorkflows: 0,
      },
      summary: {
        passed: 0,
        failed: 0,
        warnings: 0,
        securityIssues: 0,
      },
      workflows: [],
      patches: [],
      bestPractices: {
        actionPinning: 0,
        timeouts: 0,
        permissions: 0,
        caching: 0,
        concurrency: 0,
        shellHardening: 0,
        secretsManagement: 0,
      },
    };
  }

  /**
   * Audit all GitHub Actions workflows
   */
  async auditWorkflows() {
    console.log("🔍 Auditing GitHub Actions workflows...");

    if (!fs.existsSync(this.workflowsPath)) {
      console.log("⚠️  No .github/workflows directory found");
      return this.results;
    }

    const workflowFiles = fs
      .readdirSync(this.workflowsPath)
      .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"));

    this.results.metadata.totalWorkflows = workflowFiles.length;
    console.log(`Found ${workflowFiles.length} workflow files`);

    for (const workflowFile of workflowFiles) {
      try {
        await this.auditWorkflow(workflowFile);
        this.results.metadata.auditedWorkflows++;
      } catch (error) {
        console.warn(
          `Warning: Could not audit ${workflowFile}: ${error.message}`,
        );
      }
    }

    console.log(
      `✅ Audited ${this.results.metadata.auditedWorkflows} workflows`,
    );
    return this.results;
  }

  /**
   * Audit individual workflow file
   */
  async auditWorkflow(workflowFile) {
    const workflowPath = path.join(this.workflowsPath, workflowFile);
    const workflowContent = fs.readFileSync(workflowPath, "utf8");

    let workflow;
    try {
      workflow = yaml.load(workflowContent);
    } catch (error) {
      throw new Error(`YAML parsing failed: ${error.message}`);
    }

    const audit = {
      name: workflowFile,
      displayName: workflow.name || workflowFile,
      issues: [],
      warnings: [],
      securityIssues: [],
      bestPractices: {
        actionPinning: false,
        timeouts: false,
        permissions: false,
        caching: false,
        concurrency: false,
        shellHardening: false,
        secretsManagement: false,
      },
      status: "passed",
    };

    // Audit workflow structure
    this.auditWorkflowStructure(workflow, audit);

    // Audit jobs
    if (workflow.jobs) {
      for (const [jobName, job] of Object.entries(workflow.jobs)) {
        this.auditJob(jobName, job, audit);
      }
    }

    // Calculate overall status
    if (audit.securityIssues.length > 0) {
      audit.status = "failed";
      this.results.summary.failed++;
      this.results.summary.securityIssues += audit.securityIssues.length;
    } else if (audit.issues.length > 0) {
      audit.status = "failed";
      this.results.summary.failed++;
    } else if (audit.warnings.length > 0) {
      audit.status = "warning";
      this.results.summary.warnings++;
    } else {
      this.results.summary.passed++;
    }

    // Update best practices counters
    for (const [practice, implemented] of Object.entries(audit.bestPractices)) {
      if (implemented) {
        this.results.bestPractices[practice]++;
      }
    }

    this.results.workflows.push(audit);

    // Generate patch if needed
    if (audit.status === "failed" || audit.warnings.length > 0) {
      this.generateWorkflowPatch(workflowFile, workflow, audit);
    }
  }

  /**
   * Audit workflow-level structure
   */
  auditWorkflowStructure(workflow, audit) {
    // Check for concurrency control
    if (workflow.concurrency) {
      audit.bestPractices.concurrency = true;
    } else {
      audit.warnings.push({
        type: "concurrency",
        message:
          "No concurrency control defined - may cause resource conflicts",
      });
    }

    // Check permissions
    if (workflow.permissions) {
      audit.bestPractices.permissions = true;

      // Validate permissions are minimal
      if (
        workflow.permissions === "write-all" ||
        (typeof workflow.permissions === "object" &&
          Object.values(workflow.permissions).some((p) => p === "write"))
      ) {
        audit.securityIssues.push({
          type: "permissions",
          severity: "high",
          message:
            "Overly broad permissions detected - use minimal required permissions",
        });
      }
    } else {
      audit.securityIssues.push({
        type: "permissions",
        severity: "medium",
        message: "No explicit permissions defined - defaults to broad access",
      });
    }
  }

  /**
   * Audit individual job
   */
  auditJob(jobName, job, audit) {
    // Check for timeout
    if (job["timeout-minutes"]) {
      audit.bestPractices.timeouts = true;
    } else {
      audit.issues.push({
        type: "timeout",
        job: jobName,
        message: `Job '${jobName}' lacks timeout-minutes - may run indefinitely`,
      });
    }

    // Audit steps
    if (job.steps) {
      for (let i = 0; i < job.steps.length; i++) {
        this.auditStep(jobName, i, job.steps[i], audit);
      }
    }
  }

  /**
   * Audit individual step
   */
  auditStep(jobName, stepIndex, step, audit) {
    // Check action pinning
    if (step.uses) {
      if (this.isActionPinned(step.uses)) {
        audit.bestPractices.actionPinning = true;
      } else {
        audit.securityIssues.push({
          type: "action_pinning",
          severity: "critical",
          job: jobName,
          step: stepIndex,
          message: `Action '${step.uses}' not pinned to SHA - supply chain risk`,
        });
      }

      // Check for caching actions
      if (step.uses.includes("cache") || step.uses.includes("setup-node")) {
        audit.bestPractices.caching = true;
      }
    }

    // Check shell command security
    if (step.run) {
      this.auditShellCommand(step.run, jobName, stepIndex, audit);
    }

    // Check environment variables and secrets
    if (step.env) {
      this.auditEnvironmentVariables(step.env, jobName, stepIndex, audit);
    }
  }

  /**
   * Check if action is pinned to SHA
   */
  isActionPinned(actionRef) {
    // SHA format: owner/repo@<40-char-hex>
    const shaPattern = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+@[a-f0-9]{40}$/;
    return shaPattern.test(actionRef);
  }

  /**
   * Audit shell commands for security issues
   */
  auditShellCommand(command, jobName, stepIndex, audit) {
    // Check for shell injection risks
    const injectionPatterns = [
      /\$\{[^}]*\}/, // Variable substitution
      /\$\([^)]*\)/, // Command substitution
      /`[^`]*`/, // Backtick command substitution
      /\|\s*sh/, // Piping to shell
      /\|\s*bash/, // Piping to bash
      /eval\s+/, // eval usage
    ];

    for (const pattern of injectionPatterns) {
      if (pattern.test(command)) {
        audit.securityIssues.push({
          type: "shell_injection",
          severity: "high",
          job: jobName,
          step: stepIndex,
          message: "Potential shell injection vulnerability detected",
        });
        break;
      }
    }

    // Check for hardened shell usage
    if (command.includes("set -e") || command.includes("set -o pipefail")) {
      audit.bestPractices.shellHardening = true;
    } else {
      audit.warnings.push({
        type: "shell_hardening",
        job: jobName,
        step: stepIndex,
        message: "Consider using shell hardening (set -e, set -o pipefail)",
      });
    }
  }

  /**
   * Audit environment variables and secrets
   */
  auditEnvironmentVariables(env, jobName, stepIndex, audit) {
    for (const [key, value] of Object.entries(env)) {
      // Check for hardcoded secrets
      if (typeof value === "string" && !value.startsWith("${{")) {
        if (this.looksLikeSecret(key, value)) {
          audit.securityIssues.push({
            type: "hardcoded_secret",
            severity: "critical",
            job: jobName,
            step: stepIndex,
            message: `Potential hardcoded secret in environment variable '${key}'`,
          });
        }
      }

      // Check for proper secrets usage
      if (typeof value === "string" && value.includes("secrets.")) {
        audit.bestPractices.secretsManagement = true;
      }
    }
  }

  /**
   * Check if value looks like a secret
   */
  looksLikeSecret(key, value) {
    const secretKeywords = [
      "token",
      "key",
      "secret",
      "password",
      "pass",
      "auth",
    ];
    const keyLower = key.toLowerCase();

    // Check if key contains secret-like words
    const hasSecretKeyword = secretKeywords.some((keyword) =>
      keyLower.includes(keyword),
    );

    // Check if value looks like a token/key (long alphanumeric string)
    const looksLikeToken = /^[a-zA-Z0-9_-]{20,}$/.test(value);

    return hasSecretKeyword && looksLikeToken;
  }

  /**
   * Generate workflow patch
   */
  generateWorkflowPatch(workflowFile, workflow, audit) {
    const patches = [];

    // Add concurrency if missing
    if (!workflow.concurrency) {
      patches.push({
        type: "add_concurrency",
        description: "Add concurrency control",
        before: null,
        after: {
          concurrency: {
            group: "${{ github.workflow }}-${{ github.ref }}",
            "cancel-in-progress": true,
          },
        },
      });
    }

    // Add minimal permissions if missing
    if (!workflow.permissions) {
      patches.push({
        type: "add_permissions",
        description: "Add minimal permissions",
        before: null,
        after: {
          permissions: {
            contents: "read",
          },
        },
      });
    }

    // Add timeouts to jobs without them
    if (workflow.jobs) {
      for (const [jobName, job] of Object.entries(workflow.jobs)) {
        if (!job["timeout-minutes"]) {
          patches.push({
            type: "add_timeout",
            description: `Add timeout to job '${jobName}'`,
            job: jobName,
            before: null,
            after: {
              "timeout-minutes": 30,
            },
          });
        }
      }
    }

    if (patches.length > 0) {
      this.results.patches.push({
        workflow: workflowFile,
        patches: patches,
      });

      // Generate YAML patch file
      this.generateYAMLPatch(workflowFile, patches);
    }
  }

  /**
   * Generate YAML patch file
   */
  generateYAMLPatch(workflowFile, patches) {
    const patchContent = {
      workflow: workflowFile,
      patches: patches.map((patch) => ({
        type: patch.type,
        description: patch.description,
        changes: patch.after,
      })),
    };

    // Ensure patches directory exists
    const patchesDir = path.join(this.rootPath, "ci-reports", "gha-patches");
    if (!fs.existsSync(patchesDir)) {
      fs.mkdirSync(patchesDir, { recursive: true });
    }

    const patchFileName = workflowFile.replace(/\.ya?ml$/, ".fix.yml");
    const patchPath = path.join(patchesDir, patchFileName);

    fs.writeFileSync(patchPath, yaml.dump(patchContent, { indent: 2 }));
  }

  /**
   * Generate GitHub Actions audit report
   */
  generateAuditReport() {
    const report = `# GitHub Actions Audit Report

## Audit Summary

- **Total Workflows:** ${this.results.metadata.totalWorkflows}
- **Audited:** ${this.results.metadata.auditedWorkflows}
- **Passed:** ${this.results.summary.passed} ✅
- **Failed:** ${this.results.summary.failed} ❌
- **Warnings:** ${this.results.summary.warnings} ⚠️
- **Security Issues:** ${this.results.summary.securityIssues} 🔒

## Best Practices Compliance

| Practice | Implemented | Total | Percentage |
|----------|-------------|-------|------------|
| Action Pinning | ${this.results.bestPractices.actionPinning} | ${this.results.metadata.auditedWorkflows} | ${((this.results.bestPractices.actionPinning / this.results.metadata.auditedWorkflows) * 100).toFixed(1)}% |
| Timeouts | ${this.results.bestPractices.timeouts} | ${this.results.metadata.auditedWorkflows} | ${((this.results.bestPractices.timeouts / this.results.metadata.auditedWorkflows) * 100).toFixed(1)}% |
| Permissions | ${this.results.bestPractices.permissions} | ${this.results.metadata.auditedWorkflows} | ${((this.results.bestPractices.permissions / this.results.metadata.auditedWorkflows) * 100).toFixed(1)}% |
| Caching | ${this.results.bestPractices.caching} | ${this.results.metadata.auditedWorkflows} | ${((this.results.bestPractices.caching / this.results.metadata.auditedWorkflows) * 100).toFixed(1)}% |
| Concurrency | ${this.results.bestPractices.concurrency} | ${this.results.metadata.auditedWorkflows} | ${((this.results.bestPractices.concurrency / this.results.metadata.auditedWorkflows) * 100).toFixed(1)}% |
| Shell Hardening | ${this.results.bestPractices.shellHardening} | ${this.results.metadata.auditedWorkflows} | ${((this.results.bestPractices.shellHardening / this.results.metadata.auditedWorkflows) * 100).toFixed(1)}% |
| Secrets Management | ${this.results.bestPractices.secretsManagement} | ${this.results.metadata.auditedWorkflows} | ${((this.results.bestPractices.secretsManagement / this.results.metadata.auditedWorkflows) * 100).toFixed(1)}% |

## Workflow Details

${this.results.workflows
  .map(
    (workflow) => `### ${workflow.displayName} (${workflow.name})

**Status:** ${workflow.status === "passed" ? "✅ PASSED" : workflow.status === "warning" ? "⚠️ WARNING" : "❌ FAILED"}

${
  workflow.securityIssues.length > 0
    ? `**Security Issues (${workflow.securityIssues.length}):**
${workflow.securityIssues.map((issue) => `- **${issue.severity.toUpperCase()}:** ${issue.message}`).join("\n")}
`
    : ""
}

${
  workflow.issues.length > 0
    ? `**Issues (${workflow.issues.length}):**
${workflow.issues.map((issue) => `- ${issue.message}`).join("\n")}
`
    : ""
}

${
  workflow.warnings.length > 0
    ? `**Warnings (${workflow.warnings.length}):**
${workflow.warnings.map((warning) => `- ${warning.message}`).join("\n")}
`
    : ""
}

**Best Practices:**
- Action Pinning: ${workflow.bestPractices.actionPinning ? "✅" : "❌"}
- Timeouts: ${workflow.bestPractices.timeouts ? "✅" : "❌"}
- Permissions: ${workflow.bestPractices.permissions ? "✅" : "❌"}
- Caching: ${workflow.bestPractices.caching ? "✅" : "❌"}
- Concurrency: ${workflow.bestPractices.concurrency ? "✅" : "❌"}
- Shell Hardening: ${workflow.bestPractices.shellHardening ? "✅" : "❌"}
- Secrets Management: ${workflow.bestPractices.secretsManagement ? "✅" : "❌"}
`,
  )
  .join("\n")}

## Available Patches

${
  this.results.patches.length > 0
    ? `${this.results.patches.length} patch files generated in \`ci-reports/gha-patches/\`:

${this.results.patches.map((patch) => `- **${patch.workflow}**: ${patch.patches.length} fixes available`).join("\n")}
`
    : "No patches required - all workflows are compliant!"
}

## Security Assessment

- **Critical Issues:** ${this.results.workflows.reduce((sum, w) => sum + w.securityIssues.filter((i) => i.severity === "critical").length, 0)} ${this.results.workflows.reduce((sum, w) => sum + w.securityIssues.filter((i) => i.severity === "critical").length, 0) === 0 ? "✅" : "❌"}
- **High Issues:** ${this.results.workflows.reduce((sum, w) => sum + w.securityIssues.filter((i) => i.severity === "high").length, 0)} ${this.results.workflows.reduce((sum, w) => sum + w.securityIssues.filter((i) => i.severity === "high").length, 0) === 0 ? "✅" : "⚠️"}
- **Medium Issues:** ${this.results.workflows.reduce((sum, w) => sum + w.securityIssues.filter((i) => i.severity === "medium").length, 0)}

## Overall Assessment

${
  this.results.summary.failed === 0 && this.results.summary.securityIssues === 0
    ? "✅ **EXCELLENT** - All workflows pass security and reliability checks!"
    : this.results.summary.securityIssues > 0
      ? "❌ **NEEDS IMMEDIATE ATTENTION** - Security issues detected that require fixes before production use."
      : "⚠️ **GOOD** - Minor improvements recommended for optimal reliability and security."
}
`;

    return report;
  }

  /**
   * Execute GitHub Actions audit
   */
  async executeGHAAudit() {
    const results = await this.auditWorkflows();

    // Ensure output directory exists
    const reportsDir = path.join(this.rootPath, "ci-reports");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Write JSON results
    fs.writeFileSync(
      path.join(reportsDir, "gha-audit.json"),
      JSON.stringify(results, null, 2),
    );

    // Write audit report
    const auditReport = this.generateAuditReport();
    fs.writeFileSync(
      path.join(this.rootPath, "docs", "GHA_AUDIT.md"),
      auditReport,
    );

    console.log("📁 Generated: ci-reports/gha-audit.json");
    console.log("📁 Generated: docs/GHA_AUDIT.md");
    if (this.results.patches.length > 0) {
      console.log(
        `📁 Generated: ${this.results.patches.length} patch files in ci-reports/gha-patches/`,
      );
    }

    return results;
  }
}

// Execute if run directly
if (require.main === module) {
  const auditor = new GitHubActionsAuditor(process.cwd());
  auditor
    .executeGHAAudit()
    .then((results) => {
      console.log(
        `🎯 GHA Audit: ${results.summary.passed} passed, ${results.summary.failed} failed`,
      );
      console.log(`🎯 Security Issues: ${results.summary.securityIssues}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ GitHub Actions audit failed:", error);
      process.exit(1);
    });
}

module.exports = { GitHubActionsAuditor };
