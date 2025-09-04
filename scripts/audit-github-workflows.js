#!/usr/bin/env node

/**
 * GitHub Actions Workflow Audit Script
 * Comprehensive validation and security analysis of all workflows
 *
 * @author Ali Kahwaji
 * @version 1.0.0
 */

const fs = require("fs");
// eslint-disable-line global-require
const path = require("path");
// eslint-disable-line global-require
const yaml = require("js-yaml");
// eslint-disable-line global-require

class WorkflowAuditor {
  constructor() {
    this.workflowsDir = path.join(__dirname, "..", ".github", "workflows");
    this.auditResults = {
      summary: {
        totalWorkflows: 0,
        passedWorkflows: 0,
        failedWorkflows: 0,
        warningWorkflows: 0,
        criticalIssues: 0,
        securityIssues: 0,
      },
      workflows: {},
      recommendations: [],
    };

    // Security patterns to check
    this.securityPatterns = {
      secrets: /\$\{\{\s*secrets\.[A-Z_]+\s*\}\}/g,
      hardcodedSecrets: /(password|token|key|secret)\s*[:=]\s*['"][^'"]+['"]/gi,
      unsafeActions: /(checkout@v[12]|setup-node@v[12]|upload-artifact@v[12])/g,
      shellInjection: /\$\{\{\s*github\.(event\.|head_ref|base_ref)/g,
    };

    // Best practices patterns
    this.bestPractices = {
      pinned_versions: /@v\d+$/,
      permissions_defined: /permissions:/,
      timeout_defined: /timeout-minutes:/,
      continue_on_error: /continue-on-error:/,
    };
  }

  /**
   * Main audit function
   */
  async audit() {
    console.log("🔍 Starting GitHub Actions Workflow Audit...\n");
    // eslint-disable-line no-console

    try {
      const workflowFiles = this.getWorkflowFiles();
      this.auditResults.summary.totalWorkflows = workflowFiles.length;

      for (const file of workflowFiles) {
        await this.auditWorkflow(file);
      }

      this.generateSummary();
      this.generateRecommendations();
      await this.saveAuditReport();

      console.log("✅ Audit completed successfully!");
      // eslint-disable-line no-console
      console.log(
        `📊 Results: ${this.auditResults.summary.passedWorkflows} passed, ${this.auditResults.summary.failedWorkflows} failed, ${this.auditResults.summary.warningWorkflows} warnings`,
      );
      // eslint-disable-line no-console
    } catch (error) {
      console.error("❌ Audit failed:", error.message);
      // eslint-disable-line no-console
      process.exit(1);
    }
  }

  /**
   * Get all workflow files
   */
  getWorkflowFiles() {
    if (!fs.existsSync(this.workflowsDir)) {
      throw new Error(`Workflows directory not found: ${this.workflowsDir}`);
    }

    return fs
      .readdirSync(this.workflowsDir)
      .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
      .map((file) => path.join(this.workflowsDir, file));
  }

  /**
   * Audit individual workflow
   */
  async auditWorkflow(_filePath) {
    const fileName = path.basename(_filePath);
    console.log(`🔍 Auditing: ${fileName}`);
    // eslint-disable-line no-console

    const result = {
      file: fileName,
      path: _filePath,
      status: "passed",
      issues: [],
      warnings: [],
      security: [],
      bestPractices: [],
      metadata: {},
    };

    try {
      const content = fs.readFileSync(_filePath, "utf8");
      const workflow = yaml.load(content);

      // Basic structure validation
      this.validateYamlStructure(workflow, result);

      // Security audit
      this.auditSecurity(content, workflow, result);

      // Trigger and event validation
      this.auditTriggers(workflow, result);

      // Job dependencies and race conditions
      this.auditJobDependencies(workflow, result);

      // Action and script validation
      this.auditActionsAndScripts(workflow, result);

      // Best practices check
      this.auditBestPractices(content, workflow, result);

      // Performance and reliability
      this.auditPerformance(workflow, result);
    } catch (error) {
      result.status = "failed";
      result.issues.push({
        _type: "parse_error",
        severity: "critical",
        message: `Failed to parse YAML: ${error.message}`,
        line: this.extractLineNumber(error.message),
      });
    }

    // Determine overall status
    this.determineWorkflowStatus(result);
    this.auditResults.workflows[fileName] = result;

    console.log(`  Status: ${result.status.toUpperCase()}`);
    // eslint-disable-line no-console
    if (result.issues.length > 0) {
      console.log(`  Issues: ${result.issues.length}`);
      // eslint-disable-line no-console
    }
    if (result.security.length > 0) {
      console.log(`  Security: ${result.security.length}`);
      // eslint-disable-line no-console
    }
  }

  /**
   * Validate YAML structure and required fields
   */
  validateYamlStructure(workflow, result) {
    if (!workflow.name) {
      result.issues.push({
        _type: "structure",
        severity: "medium",
        message: "Workflow name is missing",
      });
    }

    if (!workflow.on) {
      result.issues.push({
        _type: "structure",
        severity: "critical",
        message: "Workflow triggers (on) are missing",
      });
    }

    if (!workflow.jobs || Object.keys(workflow.jobs).length === 0) {
      result.issues.push({
        _type: "structure",
        severity: "critical",
        message: "No jobs defined in workflow",
      });
    }

    // Store metadata
    result.metadata = {
      name: workflow.name,
      jobCount: workflow.jobs ? Object.keys(workflow.jobs).length : 0,
      hasPermissions: !!workflow.permissions,
      hasEnv: !!workflow.env,
    };
  }

  /**
   * Security audit
   */
  auditSecurity(content, workflow, result) {
    // Check for hardcoded secrets
    const hardcodedMatches = content.match(
      this.securityPatterns.hardcodedSecrets,
    );
    if (hardcodedMatches) {
      result.security.push({
        _type: "hardcoded_secrets",
        severity: "critical",
        message: `Potential hardcoded secrets found: ${hardcodedMatches.length} instances`,
        details: hardcodedMatches.slice(0, 3), // Show first 3 matches
      });
    }

    // Check for unsafe action versions
    const unsafeActions = content.match(this.securityPatterns.unsafeActions);
    if (unsafeActions) {
      result.security.push({
        _type: "unsafe_actions",
        severity: "high",
        message: `Outdated/unsafe action versions found`,
        details: [...new Set(unsafeActions)],
      });
    }

    // Check for shell injection vulnerabilities
    const shellInjection = content.match(this.securityPatterns.shellInjection);
    if (shellInjection) {
      result.security.push({
        _type: "shell_injection",
        severity: "critical",
        message: `Potential shell injection vulnerabilities`,
        details: [...new Set(shellInjection)],
      });
    }

    // Check permissions
    if (workflow.permissions) {
      this.auditPermissions(workflow.permissions, result);
    } else {
      result.warnings.push({
        _type: "permissions",
        severity: "medium",
        message: "No explicit permissions defined (using default)",
      });
    }

    // Check secret usage
    const secretUsage = content.match(this.securityPatterns.secrets);
    if (secretUsage) {
      result.metadata.secretsUsed = [...new Set(secretUsage)];
    }
  }

  /**
   * Audit permissions
   */
  auditPermissions(permissions, result) {
    const dangerousPermissions = ["write-all", "admin"];
    const broadPermissions = [
      "contents: write",
      "packages: write",
      "security-events: write",
    ];

    const permStr = JSON.stringify(permissions).toLowerCase();

    for (const dangerous of dangerousPermissions) {
      if (permStr.includes(dangerous)) {
        result.security.push({
          _type: "dangerous_permissions",
          severity: "high",
          message: `Dangerous permission detected: ${dangerous}`,
        });
      }
    }
  }

  /**
   * Audit triggers and events
   */
  auditTriggers(workflow, result) {
    const triggers = workflow.on;

    if (typeof triggers === "string") {
      // Single trigger
      if (triggers === "push" || triggers === "pull_request") {
        result.warnings.push({
          _type: "broad_trigger",
          severity: "low",
          message: `Broad trigger without branch restrictions: ${triggers}`,
        });
      }
    } else if (typeof triggers === "object") {
      // Multiple triggers
      if (triggers.push && !triggers.push.branches) {
        result.warnings.push({
          _type: "unrestricted_push",
          severity: "medium",
          message: "Push trigger without branch restrictions",
        });
      }

      if (triggers.schedule) {
        result.metadata.hasSchedule = true;
        // Validate cron syntax (basic check)
        const schedules = Array.isArray(triggers.schedule)
          ? triggers.schedule
          : [triggers.schedule];
        for (const schedule of schedules) {
          if (schedule.cron && !this.isValidCron(schedule.cron)) {
            result.issues.push({
              _type: "invalid_cron",
              severity: "medium",
              message: `Invalid cron expression: ${schedule.cron}`,
            });
          }
        }
      }
    }
  }

  /**
   * Audit job dependencies and race conditions
   */
  auditJobDependencies(workflow, result) {
    if (!workflow.jobs) return;

    const jobs = workflow.jobs;
    const jobNames = Object.keys(jobs);
    const dependencyGraph = {};

    // Build dependency graph
    for (const [jobName, job] of Object.entries(jobs)) {
      dependencyGraph[jobName] = job.needs
        ? Array.isArray(job.needs)
          ? job.needs
          : [job.needs]
        : [];
    }

    // Check for circular dependencies
    if (this.hasCircularDependency(dependencyGraph)) {
      result.issues.push({
        _type: "circular_dependency",
        severity: "critical",
        message: "Circular dependency detected in job dependencies",
      });
    }

    // Check for unreferenced dependencies
    for (const [jobName, dependencies] of Object.entries(dependencyGraph)) {
      for (const dep of dependencies) {
        if (!jobNames.includes(dep)) {
          result.issues.push({
            _type: "missing_dependency",
            severity: "high",
            message: `Job '${jobName}' depends on non-existent job '${dep}'`,
          });
        }
      }
    }

    result.metadata.jobDependencies = dependencyGraph;
  }

  /**
   * Audit actions and scripts
   */
  auditActionsAndScripts(workflow, result) {
    if (!workflow.jobs) return;

    const actionVersions = new Set();
    const scriptCommands = [];

    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      if (!job.steps) continue;

      for (const step of job.steps) {
        // Check action versions
        if (step.uses) {
          actionVersions.add(step.uses);

          // Check for unpinned versions
          if (
            !step.uses.includes("@") ||
            step.uses.endsWith("@main") ||
            step.uses.endsWith("@master")
          ) {
            result.warnings.push({
              _type: "unpinned_action",
              severity: "medium",
              message: `Unpinned action version: ${step.uses}`,
              job: jobName,
            });
          }
        }

        // Check script commands
        if (step.run) {
          scriptCommands.push({
            job: jobName,
            step: step.name || "unnamed",
            script: step.run,
          });

          // Check for dangerous commands
          if (this.containsDangerousCommands(step.run)) {
            result.security.push({
              _type: "dangerous_script",
              severity: "high",
              message: `Potentially dangerous script commands in job '${jobName}'`,
              step: step.name || "unnamed",
            });
          }
        }
      }
    }

    result.metadata.actionsUsed = Array.from(actionVersions);
    result.metadata.scriptCount = scriptCommands.length;
  }

  /**
   * Audit best practices
   */
  auditBestPractices(content, workflow, result) {
    // Check for timeouts
    if (!content.includes("timeout-minutes")) {
      result.warnings.push({
        _type: "no_timeout",
        severity: "low",
        message: "No timeout specified for jobs (could run indefinitely)",
      });
    }

    // Check for concurrency controls
    if (!workflow.concurrency) {
      result.warnings.push({
        _type: "no_concurrency",
        severity: "low",
        message: "No concurrency controls defined",
      });
    }

    // Check for proper error handling
    if (
      !content.includes("continue-on-error") &&
      !content.includes("if: failure()")
    ) {
      result.warnings.push({
        _type: "no_error_handling",
        severity: "low",
        message: "Limited error handling patterns detected",
      });
    }

    // Check for caching
    if (content.includes("npm ci") && !content.includes("cache:")) {
      result.warnings.push({
        _type: "no_caching",
        severity: "low",
        message: "Node.js dependencies installed without caching",
      });
    }
  }

  /**
   * Audit performance and reliability
   */
  auditPerformance(workflow, result) {
    if (!workflow.jobs) return;

    let hasMatrix = false;
    let hasParallelJobs = false;

    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      if (job.strategy && job.strategy.matrix) {
        hasMatrix = true;
      }

      if (!job.needs || job.needs.length === 0) {
        hasParallelJobs = true;
      }
    }

    result.metadata.hasMatrix = hasMatrix;
    result.metadata.hasParallelJobs = hasParallelJobs;

    // Check for potential performance issues
    if (Object.keys(workflow.jobs).length > 10) {
      result.warnings.push({
        _type: "many_jobs",
        severity: "low",
        message: `Large number of jobs (${Object.keys(workflow.jobs).length}) may impact performance`,
      });
    }
  }

  /**
   * Helper methods
   */
  isValidCron(cron) {
    // Basic cron validation (5 or 6 fields)
    const parts = cron.trim().split(/\s+/);
    return parts.length === 5 || parts.length === 6;
  }

  hasCircularDependency(graph) {
    const visited = new Set();
    const recursionStack = new Set();

    const hasCycle = (node) => {
      if (recursionStack.has(node)) return true;
      if (visited.has(node)) return false;

      visited.add(node);
      recursionStack.add(node);

      for (const neighbor of graph[node] || []) {
        if (hasCycle(neighbor)) return true;
      }

      recursionStack.delete(node);
      return false;
    };

    for (const node of Object.keys(graph)) {
      if (hasCycle(node)) return true;
    }

    return false;
  }

  containsDangerousCommands(script) {
    const dangerous = [
      /rm\s+-rf\s+\//, // rm -rf /
      /sudo\s+/, // sudo commands
      /curl.*\|\s*sh/, // curl | sh
      /wget.*\|\s*sh/, // wget | sh
      /eval\s+/, // eval commands
      /\$\(.*\)/, // command substitution without proper escaping
    ];

    return dangerous.some((pattern) => pattern.test(script));
  }

  extractLineNumber(errorMessage) {
    const match = errorMessage.match(/line (\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  /**
   * Determine overall workflow status
   */
  determineWorkflowStatus(result) {
    const criticalIssues = result.issues.filter(
      (i) => i.severity === "critical",
    ).length;
    const securityIssues = result.security.filter(
      (s) => s.severity === "critical" || s.severity === "high",
    ).length;

    if (criticalIssues > 0 || securityIssues > 0) {
      result.status = "failed";
      this.auditResults.summary.failedWorkflows++;
      this.auditResults.summary.criticalIssues += criticalIssues;
      this.auditResults.summary.securityIssues += securityIssues;
    } else if (result.warnings.length > 0 || result.security.length > 0) {
      result.status = "warning";
      this.auditResults.summary.warningWorkflows++;
    } else {
      result.status = "passed";
      this.auditResults.summary.passedWorkflows++;
    }
  }

  /**
   * Generate summary and recommendations
   */
  generateSummary() {
    console.log("\n📊 AUDIT SUMMARY");
    // eslint-disable-line no-console
    console.log("================");
    // eslint-disable-line no-console
    console.log(`Total Workflows: ${this.auditResults.summary.totalWorkflows}`);
    // eslint-disable-line no-console
    console.log(`✅ Passed: ${this.auditResults.summary.passedWorkflows}`);
    // eslint-disable-line no-console
    console.log(`⚠️  Warnings: ${this.auditResults.summary.warningWorkflows}`);
    // eslint-disable-line no-console
    console.log(`❌ Failed: ${this.auditResults.summary.failedWorkflows}`);
    // eslint-disable-line no-console
    console.log(
      `🔒 Security Issues: ${this.auditResults.summary.securityIssues}`,
    );
    // eslint-disable-line no-console
    console.log(
      `🚨 Critical Issues: ${this.auditResults.summary.criticalIssues}`,
    );
    // eslint-disable-line no-console
  }

  generateRecommendations() {
    const recommendations = [];

    // Security recommendations
    if (this.auditResults.summary.securityIssues > 0) {
      recommendations.push({
        category: "Security",
        priority: "High",
        title: "Address Security Vulnerabilities",
        description: "Review and fix all security issues found in workflows",
        action:
          "Update action versions, fix shell injection risks, review permissions",
      });
    }

    // Performance recommendations
    const workflowsWithoutCaching = Object.values(
      this.auditResults.workflows,
    ).filter((w) =>
      w.warnings.some((warn) => warn._type === "no_caching"),
    ).length;

    if (workflowsWithoutCaching > 0) {
      recommendations.push({
        category: "Performance",
        priority: "Medium",
        title: "Implement Dependency Caching",
        description: `${workflowsWithoutCaching} workflows could benefit from dependency caching`,
        action: "Add cache configuration to Node.js setup steps",
      });
    }

    // Reliability recommendations
    const workflowsWithoutTimeouts = Object.values(
      this.auditResults.workflows,
    ).filter((w) =>
      w.warnings.some((warn) => warn._type === "no_timeout"),
    ).length;

    if (workflowsWithoutTimeouts > 0) {
      recommendations.push({
        category: "Reliability",
        priority: "Medium",
        title: "Add Job Timeouts",
        description: `${workflowsWithoutTimeouts} workflows lack timeout configurations`,
        action: "Add timeout-minutes to prevent runaway jobs",
      });
    }

    this.auditResults.recommendations = recommendations;
  }

  /**
   * Save audit report
   */
  async saveAuditReport() {
    const reportPath = path.join(
      __dirname,
      "..",
      "docs",
      "GITHUB_ACTIONS_AUDIT_REPORT.md",
    );
    const jsonReportPath = path.join(
      __dirname,
      "..",
      "github-actions-audit-results.json",
    );

    // Save JSON report
    fs.writeFileSync(
      jsonReportPath,
      JSON.stringify(this.auditResults, null, 2),
    );

    // Generate Markdown report
    const markdown = this.generateMarkdownReport();
    fs.writeFileSync(reportPath, markdown);

    console.log(`\n📄 Reports saved:`);
    // eslint-disable-line no-console
    console.log(`  - Markdown: ${reportPath}`);
    // eslint-disable-line no-console
    console.log(`  - JSON: ${jsonReportPath}`);
    // eslint-disable-line no-console
  }

  /**
   * Generate Markdown report
   */
  generateMarkdownReport() {
    const timestamp = new Date().toISOString();

    let markdown = `# GitHub Actions Workflow Audit Report

**Generated:** ${timestamp}  
**Repository:** DevilsDev/rag-pipeline-utils  
**Auditor:** GitHub Actions Workflow Auditor v1.0.0

## Executive Summary

| Metric | Count |
|--------|-------|
| Total Workflows | ${this.auditResults.summary.totalWorkflows} |
| ✅ Passed | ${this.auditResults.summary.passedWorkflows} |
| ⚠️ Warnings | ${this.auditResults.summary.warningWorkflows} |
| ❌ Failed | ${this.auditResults.summary.failedWorkflows} |
| 🔒 Security Issues | ${this.auditResults.summary.securityIssues} |
| 🚨 Critical Issues | ${this.auditResults.summary.criticalIssues} |

## Recommendations

`;

    for (const rec of this.auditResults.recommendations) {
      markdown += `### ${rec.title} (${rec.priority} Priority)

**Category:** ${rec.category}  
**Description:** ${rec.description}  
**Action:** ${rec.action}

`;
    }

    markdown += `## Detailed Workflow Analysis

`;

    for (const [fileName, result] of Object.entries(
      this.auditResults.workflows,
    )) {
      const statusEmoji =
        result.status === "passed"
          ? "✅"
          : result.status === "warning"
            ? "⚠️"
            : "❌";

      markdown += `### ${statusEmoji} ${fileName}

**Status:** ${result.status.toUpperCase()}  
**Jobs:** ${result.metadata.jobCount}  
**Actions Used:** ${result.metadata.actionsUsed ? result.metadata.actionsUsed.length : 0}  
**Scripts:** ${result.metadata.scriptCount || 0}

`;

      if (result.issues.length > 0) {
        markdown += `#### Issues (${result.issues.length})

`;
        for (const issue of result.issues) {
          markdown += `- **${issue.severity.toUpperCase()}**: ${issue.message}\n`;
        }
        markdown += "\n";
      }

      if (result.security.length > 0) {
        markdown += `#### Security Findings (${result.security.length})

`;
        for (const security of result.security) {
          markdown += `- **${security.severity.toUpperCase()}**: ${security.message}\n`;
        }
        markdown += "\n";
      }

      if (result.warnings.length > 0) {
        markdown += `#### Warnings (${result.warnings.length})

`;
        for (const warning of result.warnings) {
          markdown += `- ${warning.message}\n`;
        }
        markdown += "\n";
      }
    }

    markdown += `## Audit Methodology

This audit examined the following areas:

1. **YAML Syntax & Structure** - Validation of workflow file structure and required fields
2. **Security Analysis** - Detection of hardcoded secrets, unsafe actions, shell injection risks
3. **Trigger Configuration** - Validation of workflow triggers and event handling
4. **Job Dependencies** - Analysis of job dependency graphs and race conditions
5. **Action Validation** - Verification of action versions and script safety
6. **Best Practices** - Compliance with GitHub Actions best practices
7. **Performance & Reliability** - Assessment of timeout, caching, and error handling

## Next Steps

1. Address all **CRITICAL** and **HIGH** severity issues immediately
2. Review and implement security recommendations
3. Consider performance optimizations for workflows with warnings
4. Establish regular workflow auditing as part of CI/CD maintenance

---

*This report was generated automatically by the GitHub Actions Workflow Auditor.*
`;

    return markdown;
  }
}

// Run audit if called directly
if (require.main === module) {
  const auditor = new WorkflowAuditor();
  auditor.audit().catch(console.error);
}

module.exports = WorkflowAuditor;
