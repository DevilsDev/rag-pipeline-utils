#!/usr/bin/env node

/**
 * Run Affected Tests Script
 * Computes and runs only affected test files based on changed files
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

class AffectedTestRunner {
  constructor() {
    this.testPatterns = [
      { pattern: /src\/.*\.js$/, testDir: "__tests__" },
      { pattern: /src\/cli\/.*\.js$/, testDir: "__tests__/cli" },
      { pattern: /src\/ecosystem\/.*\.js$/, testDir: "__tests__/ecosystem" },
      { pattern: /src\/core\/.*\.js$/, testDir: "__tests__/unit" },
      { pattern: /src\/ai\/.*\.js$/, testDir: "__tests__/ai" },
      { pattern: /src\/dx\/.*\.js$/, testDir: "__tests__/dx" },
    ];
  }

  findAffectedTests(changedFiles) {
    const affectedTests = new Set();

    changedFiles.forEach((file) => {
      // Direct test file changes
      if (file.includes("__tests__") && file.endsWith(".test.js")) {
        affectedTests.add(file);
        return;
      }

      // Source file changes - find corresponding tests
      this.testPatterns.forEach(({ pattern, testDir }) => {
        if (pattern.test(file)) {
          const relativePath = file.replace(/^src\//, "");
          const baseName = path.basename(file, ".js");

          // Look for corresponding test files
          const possibleTests = [
            `${testDir}/${relativePath.replace(".js", ".test.js")}`,
            `${testDir}/${baseName}.test.js`,
            `${testDir}/unit/${baseName}.test.js`,
            `${testDir}/integration/${baseName}.test.js`,
          ];

          possibleTests.forEach((testPath) => {
            if (fs.existsSync(testPath)) {
              affectedTests.add(testPath);
            }
          });
        }
      });

      // Special cases for core modules
      if (file.includes("plugin-hub")) {
        affectedTests.add("__tests__/ecosystem/plugin-hub.test.js");
      }
      if (file.includes("dag-engine")) {
        affectedTests.add("__tests__/unit/dag/error-handling.test.js");
      }
      if (file.includes("cli")) {
        // Add all CLI tests
        const cliTests = this.findTestFiles("__tests__/cli");
        cliTests.forEach((test) => affectedTests.add(test));
      }
    });

    return Array.from(affectedTests);
  }

  findTestFiles(directory) {
    const tests = [];
    if (!fs.existsSync(directory)) return tests;

    const files = fs.readdirSync(directory, { withFileTypes: true });
    files.forEach((file) => {
      const fullPath = path.join(directory, file.name);
      if (file.isDirectory()) {
        tests.push(...this.findTestFiles(fullPath));
      } else if (file.name.endsWith(".test.js")) {
        tests.push(fullPath);
      }
    });

    return tests;
  }

  runTests(testFiles, options = {}) {
    if (testFiles.length === 0) {
      console.log("No affected tests found.");
      return { success: true, results: null };
    }

    console.log(`Running ${testFiles.length} affected test files:`);
    testFiles.forEach((file) => console.log(`  - ${file}`));

    const jestArgs = [
      "--reporters=default",
      "--json",
      "--outputFile=test-results-affected.json",
      ...testFiles.map((f) => `"${f}"`),
    ];

    if (options.maxWorkers) {
      jestArgs.unshift(`--maxWorkers=${options.maxWorkers}`);
    }

    try {
      const command = `npx jest ${jestArgs.join(" ")}`;
      console.log(`\nExecuting: ${command}`);

      const output = execSync(command, {
        encoding: "utf8",
        stdio: "pipe",
      });

      console.log(output);

      return {
        success: true,
        results: this.parseResults("test-results-affected.json"),
        output,
      };
    } catch (error) {
      console.error("Test execution failed:", error.message);

      return {
        success: false,
        results: this.parseResults("test-results-affected.json"),
        error: error.message,
        output: error.stdout,
      };
    }
  }

  parseResults(resultsFile) {
    if (!fs.existsSync(resultsFile)) {
      return null;
    }

    try {
      const results = JSON.parse(fs.readFileSync(resultsFile, "utf8"));
      return {
        numTotalTestSuites: results.numTotalTestSuites,
        numPassedTestSuites: results.numPassedTestSuites,
        numFailedTestSuites: results.numFailedTestSuites,
        numTotalTests: results.numTotalTests,
        numPassedTests: results.numPassedTests,
        numFailedTests: results.numFailedTests,
        success: results.success,
      };
    } catch (error) {
      console.error("Failed to parse test results:", error.message);
      return null;
    }
  }

  saveReport(changedFiles, affectedTests, results) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportPath = path.join(
      process.cwd(),
      "ci-reports",
      `affected-run-${timestamp}.json`,
    );

    // Ensure ci-reports directory exists
    const reportsDir = path.dirname(reportPath);
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const report = {
      timestamp: new Date().toISOString(),
      changedFiles,
      affectedTests,
      results,
      summary: results
        ? {
            testSuites: `${results.numPassedTestSuites}/${results.numTotalTestSuites} passed`,
            tests: `${results.numPassedTests}/${results.numTotalTests} passed`,
            success: results.success,
          }
        : "No results available",
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nAffected test report saved: ${reportPath}`);

    return reportPath;
  }
}

// Main execution
if (require.main === module) {
  const runner = new AffectedTestRunner();

  // Get changed files from command line or git
  let changedFiles = process.argv.slice(2);

  if (changedFiles.length === 0) {
    try {
      // Get changed files from git (staged + unstaged)
      const gitOutput = execSync("git diff --name-only HEAD", {
        encoding: "utf8",
      });
      changedFiles = gitOutput
        .trim()
        .split("\n")
        .filter((f) => f.length > 0);

      if (changedFiles.length === 0) {
        // If no changes, get recently modified files
        const recentFiles = execSync("git diff --name-only HEAD~1", {
          encoding: "utf8",
        });
        changedFiles = recentFiles
          .trim()
          .split("\n")
          .filter((f) => f.length > 0);
      }
    } catch (error) {
      console.log("Could not get changed files from git, running all tests");
      changedFiles = ["src/"]; // Fallback to all source files
    }
  }

  console.log("Changed files:", changedFiles);

  const affectedTests = runner.findAffectedTests(changedFiles);
  const results = runner.runTests(affectedTests, { maxWorkers: "50%" });

  runner.saveReport(changedFiles, affectedTests, results.results);

  process.exit(results.success ? 0 : 1);
}

module.exports = AffectedTestRunner;
