#!/usr/bin/env node

/**
 * @fileoverview Comprehensive Test Reporter
 * Generates detailed test reports with coverage, performance metrics, and visual output
 *
 * @author DevilsDev Team
 * @since 2.1.8
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

class TestReporter {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "test",
      nodeVersion: process.version,
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        coverage: {},
      },
      suites: [],
      failures: [],
      performance: {},
      security: {},
      reports: [],
    };
  }

  /**
   * Run comprehensive test suite with reporting
   */
  async runTests() {
    console.log("\n🧪 RAG Pipeline Utils - Comprehensive Test Report");
    console.log("=".repeat(80));
    console.log(`📅 Timestamp: ${this.results.timestamp}`);
    console.log(`🌍 Environment: ${this.results.environment}`);
    console.log(`⚡ Node.js: ${this.results.nodeVersion}`);
    console.log("=".repeat(80));

    try {
      // Run tests with Jest and capture output
      await this.executeTestSuite();

      // Generate coverage report
      await this.generateCoverageReport();

      // Analyze performance metrics
      await this.analyzePerformanceMetrics();

      // Security scan results
      await this.collectSecurityMetrics();

      // Generate visual reports
      await this.generateVisualReports();

      // Output final summary
      this.printSummary();

      // Save detailed JSON report
      await this.saveJsonReport();
    } catch (error) {
      console.error("❌ Test execution failed:", error.message);
      process.exit(1);
    }
  }

  /**
   * Execute the main test suite
   */
  async executeTestSuite() {
    console.log("\n📋 Executing Test Suite...");

    const startTime = Date.now();

    try {
      const output = execSync(
        "npm test -- --coverage --json --outputFile=.artifacts/test-results.json --verbose",
        {
          encoding: "utf8",
          stdio: "pipe",
          timeout: 600000, // 10 minute timeout
        },
      );

      this.results.summary.duration = Date.now() - startTime;

      // Parse Jest JSON output if available
      if (fs.existsSync(".artifacts/test-results.json")) {
        const jestResults = JSON.parse(
          fs.readFileSync(".artifacts/test-results.json", "utf8"),
        );
        this.parseJestResults(jestResults);
      }

      console.log("✅ Test suite completed successfully");
    } catch (error) {
      // Even if tests fail, we want to capture what we can
      this.results.summary.duration = Date.now() - startTime;

      if (error.stdout) {
        this.parseTestOutput(error.stdout.toString());
      }

      // Don't throw here, continue with reporting
      console.log("⚠️  Test suite completed with failures");
    }
  }

  /**
   * Parse Jest test results
   */
  parseJestResults(jestResults) {
    this.results.summary.total = jestResults.numTotalTests || 0;
    this.results.summary.passed = jestResults.numPassedTests || 0;
    this.results.summary.failed = jestResults.numFailedTests || 0;
    this.results.summary.skipped = jestResults.numPendingTests || 0;

    // Extract test suites
    if (jestResults.testResults) {
      this.results.suites = jestResults.testResults.map((suite) => ({
        name: path.relative(process.cwd(), suite.testFilePath),
        status: suite.status,
        duration: suite.perfStats?.end - suite.perfStats?.start || 0,
        tests: suite.assertionResults?.length || 0,
        passed:
          suite.assertionResults?.filter((t) => t.status === "passed").length ||
          0,
        failed:
          suite.assertionResults?.filter((t) => t.status === "failed").length ||
          0,
      }));
    }

    // Extract failures
    if (jestResults.testResults) {
      jestResults.testResults.forEach((suite) => {
        if (suite.assertionResults) {
          suite.assertionResults
            .filter((test) => test.status === "failed")
            .forEach((test) => {
              this.results.failures.push({
                suite: path.relative(process.cwd(), suite.testFilePath),
                test: test.title,
                error: test.failureMessages?.[0] || "Unknown error",
              });
            });
        }
      });
    }
  }

  /**
   * Parse test output for additional metrics
   */
  parseTestOutput(output) {
    // Extract basic metrics from console output
    const lines = output.split("\n");

    for (const line of lines) {
      if (line.includes("Tests:")) {
        const match = line.match(/(\d+) passed.*?(\d+) failed.*?(\d+) total/);
        if (match) {
          this.results.summary.passed = parseInt(match[1]);
          this.results.summary.failed = parseInt(match[2]);
          this.results.summary.total = parseInt(match[3]);
        }
      }
    }
  }

  /**
   * Generate coverage report
   */
  async generateCoverageReport() {
    console.log("\n📊 Generating Coverage Report...");

    try {
      if (fs.existsSync("coverage/coverage-summary.json")) {
        const coverage = JSON.parse(
          fs.readFileSync("coverage/coverage-summary.json", "utf8"),
        );

        this.results.summary.coverage = {
          statements: coverage.total?.statements?.pct || 0,
          branches: coverage.total?.branches?.pct || 0,
          functions: coverage.total?.functions?.pct || 0,
          lines: coverage.total?.lines?.pct || 0,
        };

        console.log(
          `📈 Statement Coverage: ${this.results.summary.coverage.statements}%`,
        );
        console.log(
          `🌿 Branch Coverage: ${this.results.summary.coverage.branches}%`,
        );
        console.log(
          `🔧 Function Coverage: ${this.results.summary.coverage.functions}%`,
        );
        console.log(
          `📝 Line Coverage: ${this.results.summary.coverage.lines}%`,
        );
      }
    } catch (error) {
      console.log("⚠️  Coverage data not available");
    }
  }

  /**
   * Analyze performance metrics from test reports
   */
  async analyzePerformanceMetrics() {
    console.log("\n⚡ Analyzing Performance Metrics...");

    const performanceFiles = [
      "performance-reports/concurrent-pipeline-performance.json",
      "performance-reports/large-batch-performance.json",
      "performance-reports/streaming-performance.json",
    ];

    this.results.performance = {};

    for (const file of performanceFiles) {
      if (fs.existsSync(file)) {
        try {
          const data = JSON.parse(fs.readFileSync(file, "utf8"));
          const category = path.basename(file, ".json");
          this.results.performance[category] = data;

          if (data.summary) {
            console.log(
              `🚀 ${category}: ${data.summary.avgThroughput || "N/A"} ops/sec`,
            );
          }
        } catch (error) {
          console.log(`⚠️  Could not parse ${file}`);
        }
      }
    }
  }

  /**
   * Collect security metrics
   */
  async collectSecurityMetrics() {
    console.log("\n🔒 Collecting Security Metrics...");

    if (fs.existsSync("security-reports/security-scan-results.json")) {
      try {
        const security = JSON.parse(
          fs.readFileSync(
            "security-reports/security-scan-results.json",
            "utf8",
          ),
        );
        this.results.security = security;

        if (security.summary) {
          console.log(
            `🛡️  Security Score: ${security.summary.overallScore || "N/A"}`,
          );
          console.log(
            `🚨 Critical Issues: ${security.summary.criticalIssues || 0}`,
          );
          console.log(`⚠️  High Issues: ${security.summary.highIssues || 0}`);
        }
      } catch (error) {
        console.log("⚠️  Security scan data not available");
      }
    }
  }

  /**
   * Generate visual reports
   */
  async generateVisualReports() {
    console.log("\n📈 Generating Visual Reports...");

    // List available reports
    const reportDirs = [
      "performance-reports",
      "security-reports",
      "comprehensive-security-reports",
    ];

    for (const dir of reportDirs) {
      if (fs.existsSync(dir)) {
        const files = fs
          .readdirSync(dir)
          .filter((f) => f.endsWith(".html") || f.endsWith(".json"))
          .map((f) => path.join(dir, f));

        this.results.reports.push(...files);
      }
    }

    console.log(`📁 Generated ${this.results.reports.length} report files`);
    this.results.reports.forEach((report) => {
      console.log(`   📄 ${report}`);
    });
  }

  /**
   * Print final summary
   */
  printSummary() {
    console.log("\n" + "=".repeat(80));
    console.log("📊 TEST EXECUTION SUMMARY");
    console.log("=".repeat(80));

    // Test Results
    console.log("\n🧪 Test Results:");
    console.log(`   Total Tests: ${this.results.summary.total}`);
    console.log(`   ✅ Passed: ${this.results.summary.passed}`);
    console.log(`   ❌ Failed: ${this.results.summary.failed}`);
    console.log(`   ⏭️  Skipped: ${this.results.summary.skipped}`);
    console.log(
      `   ⏱️  Duration: ${(this.results.summary.duration / 1000).toFixed(2)}s`,
    );

    // Pass Rate
    const passRate =
      this.results.summary.total > 0
        ? (
            (this.results.summary.passed / this.results.summary.total) *
            100
          ).toFixed(1)
        : 0;
    console.log(`   📈 Pass Rate: ${passRate}%`);

    // Coverage
    if (this.results.summary.coverage.statements) {
      console.log("\n📊 Coverage Summary:");
      console.log(
        `   Statements: ${this.results.summary.coverage.statements}%`,
      );
      console.log(`   Branches: ${this.results.summary.coverage.branches}%`);
      console.log(`   Functions: ${this.results.summary.coverage.functions}%`);
      console.log(`   Lines: ${this.results.summary.coverage.lines}%`);
    }

    // Performance
    if (Object.keys(this.results.performance).length > 0) {
      console.log("\n⚡ Performance Summary:");
      Object.entries(this.results.performance).forEach(([category, data]) => {
        if (data.summary) {
          console.log(
            `   ${category}: ${data.summary.avgThroughput || "N/A"} ops/sec`,
          );
        }
      });
    }

    // Security
    if (this.results.security.summary) {
      console.log("\n🔒 Security Summary:");
      console.log(
        `   Overall Score: ${this.results.security.summary.overallScore || "N/A"}`,
      );
      console.log(
        `   Critical Issues: ${this.results.security.summary.criticalIssues || 0}`,
      );
      console.log(
        `   High Issues: ${this.results.security.summary.highIssues || 0}`,
      );
    }

    // Failures
    if (this.results.failures.length > 0) {
      console.log("\n❌ Failed Tests:");
      this.results.failures.slice(0, 5).forEach((failure) => {
        console.log(`   ${failure.suite} > ${failure.test}`);
      });

      if (this.results.failures.length > 5) {
        console.log(`   ... and ${this.results.failures.length - 5} more`);
      }
    }

    // Reports
    if (this.results.reports.length > 0) {
      console.log("\n📁 Generated Reports:");
      this.results.reports.slice(0, 10).forEach((report) => {
        console.log(`   📄 ${report}`);
      });

      if (this.results.reports.length > 10) {
        console.log(`   ... and ${this.results.reports.length - 10} more`);
      }
    }

    console.log("\n" + "=".repeat(80));

    // Final status
    if (this.results.summary.failed === 0) {
      console.log("🎉 ALL TESTS PASSED! 🎉");
    } else {
      console.log(`💥 ${this.results.summary.failed} TEST(S) FAILED!`);
    }

    console.log("=".repeat(80));
  }

  /**
   * Save detailed JSON report
   */
  async saveJsonReport() {
    const reportPath = ".artifacts/comprehensive-test-report.json";

    // Ensure artifacts directory exists
    if (!fs.existsSync(".artifacts")) {
      fs.mkdirSync(".artifacts", { recursive: true });
    }

    try {
      fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
      console.log(`\n💾 Detailed report saved: ${reportPath}`);
    } catch (error) {
      console.log("⚠️  Could not save detailed report:", error.message);
    }
  }
}

// CLI execution
if (require.main === module) {
  const reporter = new TestReporter();
  reporter.runTests().catch((error) => {
    console.error("❌ Test reporter failed:", error.message);
    process.exit(1);
  });
}

module.exports = TestReporter;
