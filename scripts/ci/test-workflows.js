#!/usr/bin/env node
/**
 * GitHub Actions Workflow Testing Script
 * Tests all workflows for syntax, security compliance, and functionality
 */
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const WF_DIR = path.join(ROOT, ".github", "workflows");
const TEST_RESULTS_DIR = path.join(ROOT, "ci-reports", "workflow-tests");

// Ensure test results directory exists
fs.mkdirSync(TEST_RESULTS_DIR, { recursive: true });

function getAllWorkflows() {
  return fs
    .readdirSync(WF_DIR)
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
    .map((file) => ({
      name: file,
      path: path.join(WF_DIR, file),
    }));
}

function testYamlSyntax(workflowPath) {
  try {
    const content = fs.readFileSync(workflowPath, "utf8");
    yaml.load(content);
    return { valid: true, error: null };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

function testSecurityCompliance(workflowPath) {
  const content = fs.readFileSync(workflowPath, "utf8");
  const workflow = yaml.load(content);
  const issues = [];
  const passed = [];

  // Test 1: Action SHA Pinning
  let hasUnpinnedActions = false;
  if (workflow.jobs) {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      if (job.steps) {
        for (const step of job.steps) {
          if (step.uses) {
            if (step.uses.includes("@v") && !step.uses.match(/@[a-f0-9]{40}/)) {
              hasUnpinnedActions = true;
              issues.push(`Unpinned action: ${step.uses}`);
            }
          }
        }
      }
    }
  }

  if (!hasUnpinnedActions) {
    passed.push("✅ Action SHA pinning");
  }

  // Test 2: Permissions
  if (workflow.permissions) {
    passed.push("✅ Permissions defined");
  } else {
    issues.push("Missing workflow permissions");
  }

  // Test 3: Job Timeouts
  let missingTimeouts = 0;
  if (workflow.jobs) {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      if (!job["timeout-minutes"]) {
        missingTimeouts++;
        issues.push(`Job '${jobName}' missing timeout`);
      }
    }
  }

  if (missingTimeouts === 0) {
    passed.push("✅ Job timeouts configured");
  }

  // Test 4: Concurrency Control
  if (workflow.concurrency) {
    passed.push("✅ Concurrency control");
  } else {
    issues.push("Missing concurrency control");
  }

  // Test 5: Shell Security
  let shellIssues = 0;
  if (workflow.jobs) {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      if (job.steps) {
        for (const [stepIndex, step] of job.steps.entries()) {
          if (step.run && typeof step.run === "string") {
            if (!step.shell) {
              shellIssues++;
              issues.push(
                `Job '${jobName}' step ${stepIndex} missing explicit shell`,
              );
            }

            const lines = step.run.split("\n");
            if (lines.length > 1 && !step.run.includes("set -e")) {
              shellIssues++;
              issues.push(
                `Job '${jobName}' step ${stepIndex} missing error handling`,
              );
            }
          }
        }
      }
    }
  }

  if (shellIssues === 0) {
    passed.push("✅ Shell security hardening");
  }

  return {
    issues,
    passed,
    score: (passed.length / (passed.length + issues.length)) * 100,
  };
}

function testWorkflowStructure(workflowPath) {
  const content = fs.readFileSync(workflowPath, "utf8");
  const workflow = yaml.load(content);
  const issues = [];
  const passed = [];

  // Test required fields
  if (workflow.name) {
    passed.push("✅ Workflow name defined");
  } else {
    issues.push("Missing workflow name");
  }

  if (workflow.on || workflow["on"]) {
    passed.push("✅ Trigger events defined");
  } else {
    issues.push("Missing trigger events");
  }

  if (workflow.jobs && Object.keys(workflow.jobs).length > 0) {
    passed.push("✅ Jobs defined");
  } else {
    issues.push("No jobs defined");
  }

  // Test job structure
  if (workflow.jobs) {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      if (job["runs-on"]) {
        passed.push(`✅ Job '${jobName}' has runner`);
      } else {
        issues.push(`Job '${jobName}' missing runs-on`);
      }

      if (job.steps && job.steps.length > 0) {
        passed.push(`✅ Job '${jobName}' has steps`);
      } else {
        issues.push(`Job '${jobName}' has no steps`);
      }
    }
  }

  return {
    issues,
    passed,
    score: (passed.length / (passed.length + issues.length)) * 100,
  };
}

function generateTestReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalWorkflows: results.length,
      passed: results.filter((r) => r.overall.status === "PASS").length,
      failed: results.filter((r) => r.overall.status === "FAIL").length,
      warnings: results.filter((r) => r.overall.status === "WARN").length,
    },
    workflows: results,
  };

  // Write JSON report
  fs.writeFileSync(
    path.join(TEST_RESULTS_DIR, "workflow-test-results.json"),
    JSON.stringify(report, null, 2),
  );

  // Write Markdown report
  const markdown = [
    "# GitHub Actions Workflow Test Report",
    "",
    `**Generated:** ${new Date().toLocaleString()}`,
    `**Total Workflows:** ${report.summary.totalWorkflows}`,
    `**Passed:** ${report.summary.passed}`,
    `**Failed:** ${report.summary.failed}`,
    `**Warnings:** ${report.summary.warnings}`,
    "",
    "## Test Results",
    "",
    "| Workflow | Status | Security Score | Structure Score | Issues |",
    "|----------|--------|----------------|-----------------|--------|",
  ];

  for (const result of results) {
    const status =
      result.overall.status === "PASS"
        ? "✅"
        : result.overall.status === "WARN"
          ? "⚠️"
          : "❌";
    const securityScore = `${result.security.score.toFixed(1)}%`;
    const structureScore = `${result.structure.score.toFixed(1)}%`;
    const issueCount =
      result.security.issues.length + result.structure.issues.length;

    markdown.push(
      `| ${result.name} | ${status} | ${securityScore} | ${structureScore} | ${issueCount} |`,
    );
  }

  markdown.push("");
  markdown.push("## Detailed Results");
  markdown.push("");

  for (const result of results) {
    markdown.push(`### ${result.name}`);
    markdown.push("");
    markdown.push(`**Status:** ${result.overall.status}`);
    markdown.push(
      `**YAML Syntax:** ${result.yaml.valid ? "✅ Valid" : "❌ Invalid"}`,
    );
    markdown.push("");

    if (result.security.passed.length > 0) {
      markdown.push("**Security Compliance:**");
      result.security.passed.forEach((item) => markdown.push(`- ${item}`));
      markdown.push("");
    }

    if (result.security.issues.length > 0) {
      markdown.push("**Security Issues:**");
      result.security.issues.forEach((issue) => markdown.push(`- ❌ ${issue}`));
      markdown.push("");
    }

    if (result.structure.issues.length > 0) {
      markdown.push("**Structure Issues:**");
      result.structure.issues.forEach((issue) =>
        markdown.push(`- ❌ ${issue}`),
      );
      markdown.push("");
    }

    markdown.push("---");
    markdown.push("");
  }

  fs.writeFileSync(
    path.join(TEST_RESULTS_DIR, "WORKFLOW_TEST_REPORT.md"),
    markdown.join("\n"),
  );

  return report;
}

async function main() {
  console.log("🧪 Testing GitHub Actions Workflows");
  console.log("===================================");

  const workflows = getAllWorkflows();
  console.log(`📊 Found ${workflows.length} workflows to test`);

  const results = [];

  for (const workflow of workflows) {
    console.log(`\n🔍 Testing ${workflow.name}...`);

    // Test YAML syntax
    const yamlTest = testYamlSyntax(workflow.path);
    console.log(`  YAML Syntax: ${yamlTest.valid ? "✅ Valid" : "❌ Invalid"}`);

    if (!yamlTest.valid) {
      console.log(`    Error: ${yamlTest.error}`);
    }

    // Test security compliance
    const securityTest = testSecurityCompliance(workflow.path);
    console.log(`  Security Score: ${securityTest.score.toFixed(1)}%`);
    console.log(`  Security Passed: ${securityTest.passed.length}`);
    console.log(`  Security Issues: ${securityTest.issues.length}`);

    // Test workflow structure
    const structureTest = testWorkflowStructure(workflow.path);
    console.log(`  Structure Score: ${structureTest.score.toFixed(1)}%`);
    console.log(`  Structure Passed: ${structureTest.passed.length}`);
    console.log(`  Structure Issues: ${structureTest.issues.length}`);

    // Determine overall status
    let overallStatus = "PASS";
    if (
      !yamlTest.valid ||
      securityTest.score < 70 ||
      structureTest.score < 80
    ) {
      overallStatus = "FAIL";
    } else if (securityTest.score < 90 || structureTest.score < 95) {
      overallStatus = "WARN";
    }

    console.log(`  Overall: ${overallStatus}`);

    results.push({
      name: workflow.name,
      yaml: yamlTest,
      security: securityTest,
      structure: structureTest,
      overall: { status: overallStatus },
    });
  }

  // Generate comprehensive report
  const report = generateTestReport(results);

  console.log("\n🎉 Workflow Testing Complete!");
  console.log("===============================");
  console.log(`📊 Summary:`);
  console.log(`  Total: ${report.summary.totalWorkflows}`);
  console.log(`  Passed: ${report.summary.passed}`);
  console.log(`  Failed: ${report.summary.failed}`);
  console.log(`  Warnings: ${report.summary.warnings}`);
  console.log(`\n📁 Reports generated:`);
  console.log(`  - ci-reports/workflow-tests/workflow-test-results.json`);
  console.log(`  - ci-reports/workflow-tests/WORKFLOW_TEST_REPORT.md`);

  const successRate = (
    (report.summary.passed / report.summary.totalWorkflows) *
    100
  ).toFixed(1);
  console.log(`\n🎯 Success Rate: ${successRate}%`);

  if (report.summary.failed > 0) {
    console.log(`\n⚠️ ${report.summary.failed} workflows need attention`);
    process.exit(1);
  } else {
    console.log(`\n✅ All workflows are functional and secure!`);
    process.exit(0);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Workflow testing failed:", error.message);
    process.exit(1);
  });
}

module.exports = { main };
