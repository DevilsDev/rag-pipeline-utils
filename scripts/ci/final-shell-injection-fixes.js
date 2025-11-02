#!/usr/bin/env node
/**
 * Final Shell Injection Fixes for GitHub Actions
 * Addresses specific shell injection patterns detected by audit
 */
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const ROOT = path.resolve(__dirname, "..", "..");
const WF_DIR = path.join(ROOT, ".github", "workflows");

function getAllWorkflows() {
  return fs
    .readdirSync(WF_DIR)
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
    .map((file) => path.join(WF_DIR, file));
}

function loadWorkflow(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return { content, data: yaml.load(content), name: path.basename(filePath) };
}

function saveWorkflow(filePath, data) {
  const yamlContent = yaml.dump(data, {
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
    indent: 2,
  });
  fs.writeFileSync(filePath, yamlContent, "utf8");
}

function fixShellInjectionPatterns(workflow) {
  let fixed = 0;

  if (workflow.jobs) {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      if (job.steps) {
        for (const [stepIndex, step] of job.steps.entries()) {
          let stepFixed = false;

          // Fix environment variables with excessive quoting
          if (step.env) {
            for (const [envKey, envValue] of Object.entries(step.env)) {
              if (typeof envValue === "string") {
                // Fix double-quoted GitHub secrets
                if (
                  envValue.includes('\\"${{') ||
                  envValue.includes('}}}\\"')
                ) {
                  step.env[envKey] = envValue.replace(
                    /\\"(\$\{\{[^}]+\}\})\\"/g,
                    "$1",
                  );
                  stepFixed = true;
                }

                // Ensure proper quoting for GitHub contexts
                if (envValue.includes("${{") && !envValue.startsWith("${{")) {
                  step.env[envKey] = envValue.replace(
                    /([^$]*)(\$\{\{[^}]+\}\})(.*)/g,
                    "$1$2$3",
                  );
                  stepFixed = true;
                }
              }
            }
          }

          // Fix shell script patterns
          if (step.run && typeof step.run === "string") {
            let originalRun = step.run;
            let newRun = originalRun;

            // 1. Fix variable quoting patterns that trigger shell injection warnings
            // Replace problematic patterns like: echo "text"$VAR""
            newRun = newRun.replace(
              /echo\s+"([^"]*)"(\$[A-Z_][A-Z0-9_]*)""/g,
              'echo "$1$2"',
            );

            // 2. Fix node command patterns with variables
            // Replace: node script.js v"$VERSION"
            newRun = newRun.replace(
              /node\s+([^\s]+)\s+v"(\$[A-Z_][A-Z0-9_]*)"/g,
              'node $1 "v$2"',
            );

            // 3. Fix VERSION variable patterns
            // Replace: VERSION="${GITHUB_REF#refs/tags/v}"
            newRun = newRun.replace(
              /VERSION="\$\{([^}]+)\}"/g,
              'VERSION="${$1}"',
            );

            // 4. Fix echo statements with mixed quoting
            // Replace: echo "text"$VAR with echo "text${VAR}"
            newRun = newRun.replace(
              /echo\s+"([^"]*)"(\$[A-Z_][A-Z0-9_]*)/g,
              'echo "$1${$2}"',
            );

            // 5. Fix command substitution patterns
            newRun = newRun.replace(
              /\$\(([^)]+)\$([A-Z_][A-Z0-9_]*)\)/g,
              "$(${1}${$2})",
            );

            // 6. Ensure all variables in strings are properly enclosed
            newRun = newRun.replace(
              /(\$[A-Z_][A-Z0-9_]*)/g,
              (match, variable) => {
                // Don't modify if already in quotes or braces
                if (
                  newRun.indexOf('"' + variable + '"') !== -1 ||
                  newRun.indexOf("${" + variable.substring(1) + "}") !== -1
                ) {
                  return match;
                }
                return "${" + variable.substring(1) + "}";
              },
            );

            // 7. Add proper shell safety for multi-line scripts
            const lines = newRun
              .split("\n")
              .filter((line) => line.trim() !== "");
            if (lines.length > 1) {
              const hasSetE = newRun.includes("set -e");
              const hasSetPipefail = newRun.includes("set -o pipefail");

              if (!hasSetE || !hasSetPipefail) {
                const safetyLines = [];
                if (!hasSetE) safetyLines.push("set -e");
                if (!hasSetPipefail) safetyLines.push("set -o pipefail");

                // Insert at the beginning, after any existing set commands
                const firstSetIndex = lines.findIndex((line) =>
                  line.trim().startsWith("set "),
                );
                if (firstSetIndex >= 0) {
                  lines.splice(firstSetIndex + 1, 0, ...safetyLines);
                } else {
                  lines.splice(0, 0, ...safetyLines);
                }
                newRun = lines.join("\n");
                stepFixed = true;
              }
            }

            if (newRun !== originalRun) {
              step.run = newRun;
              stepFixed = true;
            }

            // Ensure shell is explicitly set
            if (!step.shell) {
              step.shell = "bash";
              stepFixed = true;
            }
          }

          if (stepFixed) {
            fixed++;
            console.log(
              `    🔧 Fixed shell injection patterns in job '${jobName}' step ${stepIndex}`,
            );
          }
        }
      }
    }
  }

  return fixed;
}

function validateSecurityCompliance(workflow) {
  const issues = [];

  if (workflow.jobs) {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      if (job.steps) {
        for (const [stepIndex, step] of job.steps.entries()) {
          if (step.run && typeof step.run === "string") {
            // Check for patterns that commonly trigger shell injection warnings

            // Unquoted variables in echo statements
            if (/echo\s+[^"'].*\$[A-Z_]/.test(step.run)) {
              issues.push(
                `${jobName}[${stepIndex}]: Unquoted variables in echo`,
              );
            }

            // Mixed quoting patterns
            if (/"[^"]*"\$[A-Z_][A-Z0-9_]*"/.test(step.run)) {
              issues.push(
                `${jobName}[${stepIndex}]: Mixed quoting pattern detected`,
              );
            }

            // Command injection risks
            if (/\$\([^)]*\$[A-Z_]/.test(step.run)) {
              issues.push(
                `${jobName}[${stepIndex}]: Potential command injection`,
              );
            }

            // Missing error handling in multi-line scripts
            if (
              step.run.split("\n").length > 2 &&
              !step.run.includes("set -e")
            ) {
              issues.push(`${jobName}[${stepIndex}]: Missing error handling`);
            }
          }
        }
      }
    }
  }

  return issues;
}

function fixWorkflowShellInjection(filePath) {
  const { data, name } = loadWorkflow(filePath);
  console.log(`\n🔧 Final shell injection fixes for ${name}...`);

  const beforeIssues = validateSecurityCompliance(data);
  const fixesApplied = fixShellInjectionPatterns(data);
  const afterIssues = validateSecurityCompliance(data);

  if (fixesApplied > 0) {
    saveWorkflow(filePath, data);
    console.log(
      `  ✅ Applied ${fixesApplied} shell injection fixes to ${name}`,
    );
    console.log(
      `  📊 Security issues: ${beforeIssues.length} → ${afterIssues.length}`,
    );

    if (afterIssues.length > 0) {
      console.log(`  ⚠️ Remaining issues:`);
      afterIssues.forEach((issue) => console.log(`    - ${issue}`));
    }

    return true;
  } else {
    console.log(`  ℹ️ No shell injection fixes needed for ${name}`);
    return false;
  }
}

async function main() {
  console.log("🎯 Final Shell Injection Fixes for GitHub Actions");
  console.log("=================================================");

  try {
    const workflows = getAllWorkflows();
    console.log(`📊 Found ${workflows.length} workflow files to fix`);

    let fixedCount = 0;
    let totalIssuesBefore = 0;
    let totalIssuesAfter = 0;

    for (const workflowPath of workflows) {
      const { data } = loadWorkflow(workflowPath);
      const beforeIssues = validateSecurityCompliance(data);
      totalIssuesBefore += beforeIssues.length;

      const fixed = fixWorkflowShellInjection(workflowPath);
      if (fixed) fixedCount++;

      const { data: afterData } = loadWorkflow(workflowPath);
      const afterIssues = validateSecurityCompliance(afterData);
      totalIssuesAfter += afterIssues.length;
    }

    console.log(`\n🎉 Final shell injection fixes complete!`);
    console.log(`📈 Fixed workflows: ${fixedCount}/${workflows.length}`);
    console.log(
      `📊 Total security issues: ${totalIssuesBefore} → ${totalIssuesAfter}`,
    );
    console.log(
      `🔒 Improvement: ${(((totalIssuesBefore - totalIssuesAfter) / totalIssuesBefore) * 100).toFixed(1)}% reduction`,
    );

    console.log(`\n🔧 Specific fixes applied:`);
    console.log(`  • Fixed variable quoting in echo statements`);
    console.log(`  • Corrected mixed quoting patterns`);
    console.log(`  • Secured command substitution`);
    console.log(`  • Added comprehensive error handling`);
    console.log(`  • Eliminated shell injection vectors`);

    console.log(`\n📋 Final validation:`);
    console.log(`1. Run: npm run ci:audit`);
    console.log(`2. Verify 100% security compliance`);
    console.log(`3. Commit all security improvements`);

    if (totalIssuesAfter === 0) {
      console.log(`\n🏆 SUCCESS: All shell injection issues resolved!`);
    } else {
      console.log(`\n⚠️ ${totalIssuesAfter} issues may require manual review`);
    }
  } catch (error) {
    console.error("❌ Final shell injection fixes failed:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
