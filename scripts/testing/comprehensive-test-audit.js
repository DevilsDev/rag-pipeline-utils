#!/usr/bin/env node

/**
 * Comprehensive Test Audit Script
 * Analyzes all test cases and test suites for coverage, pass/fail status, categorization, and gaps
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

console.log("🔍 COMPREHENSIVE TEST AUDIT");
console.log("Analyzing all test cases and test suites in the project\n");

class TestAuditor {
  constructor() {
    this.testFiles = [];
    this.testSuites = [];
    this.testCases = [];
    this.categories = {};
    this.coverage = {};
    this.issues = [];
    this.recommendations = [];
  }

  // Discover all test files
  discoverTestFiles() {
    console.log("📂 Discovering test files...");

    const testDirectories = ["__tests__", "test", "tests"];

    const findTestFiles = (dir) => {
      if (!fs.existsSync(dir)) return [];

      const files = fs.readdirSync(dir, { withFileTypes: true });
      let testFiles = [];

      files.forEach((file) => {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
          testFiles = testFiles.concat(findTestFiles(fullPath));
        } else if (
          file.name.endsWith(".test.js") ||
          file.name.endsWith(".spec.js")
        ) {
          testFiles.push(fullPath);
        }
      });

      return testFiles;
    };

    testDirectories.forEach((testDir) => {
      const dirPath = path.join(process.cwd(), testDir);
      this.testFiles = this.testFiles.concat(findTestFiles(dirPath));
    });

    console.log(`✅ Found ${this.testFiles.length} test files`);
    return this.testFiles;
  }

  // Analyze test file structure
  analyzeTestStructure() {
    console.log("\n🔬 Analyzing test structure...");

    this.testFiles.forEach((testFile) => {
      try {
        const content = fs.readFileSync(testFile, "utf8");
        const relativePath = path.relative(process.cwd(), testFile);

        // Extract test suites (describe blocks)
        const describeMatches =
          content.match(/describe\(['"`]([^'"`]+)['"`]/g) || [];
        const testMatches = content.match(/it\(['"`]([^'"`]+)['"`]/g) || [];

        const fileInfo = {
          path: relativePath,
          fullPath: testFile,
          category: this.categorizeTest(relativePath),
          suites: describeMatches.map((match) =>
            match.replace(/describe\(['"`]([^'"`]+)['"`]/, "$1"),
          ),
          tests: testMatches.map((match) =>
            match.replace(/it\(['"`]([^'"`]+)['"`]/, "$1"),
          ),
          lineCount: content.split("\n").length,
          hasSetup:
            content.includes("beforeEach") || content.includes("beforeAll"),
          hasTeardown:
            content.includes("afterEach") || content.includes("afterAll"),
          hasMocks:
            content.includes("jest.mock") ||
            content.includes("mockReturnValue"),
          hasAsync: content.includes("async") && content.includes("await"),
          imports: this.extractImports(content),
          issues: this.detectIssues(content, relativePath),
        };

        this.testSuites.push(fileInfo);
        this.testCases = this.testCases.concat(
          testMatches.map((test) => ({
            name: test.replace(/it\(['"`]([^'"`]+)['"`]/, "$1"),
            suite: fileInfo.path,
            category: fileInfo.category,
          })),
        );

        // Categorize
        if (!this.categories[fileInfo.category]) {
          this.categories[fileInfo.category] = [];
        }
        this.categories[fileInfo.category].push(fileInfo);
      } catch (error) {
        this.issues.push(`Failed to analyze ${testFile}: ${error.message}`);
      }
    });

    console.log(`✅ Analyzed ${this.testSuites.length} test suites`);
    console.log(`✅ Found ${this.testCases.length} individual test cases`);
  }

  // Categorize test based on path
  categorizeTest(filePath) {
    if (filePath.includes("unit")) return "Unit Tests";
    if (filePath.includes("integration")) return "Integration Tests";
    if (filePath.includes("e2e")) return "E2E Tests";
    if (filePath.includes("performance")) return "Performance Tests";
    if (filePath.includes("security")) return "Security Tests";
    if (filePath.includes("ai")) return "AI/ML Tests";
    if (filePath.includes("ecosystem")) return "Ecosystem Tests";
    if (filePath.includes("dx")) return "Developer Experience Tests";
    if (filePath.includes("cli")) return "CLI Tests";
    if (filePath.includes("load")) return "Load Tests";
    if (filePath.includes("compatibility")) return "Compatibility Tests";
    if (filePath.includes("property")) return "Property Tests";
    if (filePath.includes("scripts")) return "Script Tests";
    return "Other Tests";
  }

  // Extract imports from test file
  extractImports(content) {
    const imports = [];
    const requireMatches =
      content.match(/require\(['"`]([^'"`]+)['"`]\)/g) || [];
    const importMatches =
      content.match(/import\s+.*\s+from\s+['"`]([^'"`]+)['"`]/g) || [];

    requireMatches.forEach((match) => {
      const module = match.replace(/require\(['"`]([^'"`]+)['"`]\)/, "$1");
      imports.push({ type: "require", module });
    });

    importMatches.forEach((match) => {
      const module = match.replace(
        /import\s+.*\s+from\s+['"`]([^'"`]+)['"`]/,
        "$1",
      );
      imports.push({ type: "import", module });
    });

    return imports;
  }

  // Detect potential issues in test files
  detectIssues(content, filePath) {
    const issues = [];

    // Check for common issues
    if (!content.includes("describe")) {
      issues.push("No test suites (describe blocks) found");
    }

    if (!content.includes("it(") && !content.includes("test(")) {
      issues.push("No test cases found");
    }

    if (
      content.includes("console.log") &&
      !content.includes("eslint-disable")
    ) {
      issues.push("Contains console.log statements");
    }

    if (
      content.includes("setTimeout") &&
      !content.includes("jest.setTimeout")
    ) {
      issues.push("Uses setTimeout without Jest timeout configuration");
    }

    if (content.includes("require is not defined")) {
      issues.push("Module resolution error detected");
    }

    if (content.includes(".only(")) {
      issues.push("Contains .only() - may skip other tests");
    }

    if (content.includes(".skip(")) {
      issues.push("Contains .skip() - skipping tests");
    }

    // Check for missing assertions
    const testBlocks =
      content.match(/it\(['"`][^'"`]+['"`][^{]*{[^}]*}/g) || [];
    testBlocks.forEach((block) => {
      if (!block.includes("expect(") && !block.includes("assert")) {
        issues.push("Test case without assertions detected");
      }
    });

    return issues;
  }

  // Run test execution analysis
  async runExecutionAnalysis() {
    console.log("\n🧪 Running test execution analysis...");

    try {
      // Try to get test results with a timeout
      const testOutput = execSync(
        "npm run test:simple -- --passWithNoTests --maxWorkers=1",
        {
          cwd: process.cwd(),
          encoding: "utf8",
          timeout: 60000,
          stdio: "pipe",
        },
      );

      this.parseTestResults(testOutput);
    } catch (error) {
      console.log(
        "⚠️ Test execution timed out or failed - using static analysis",
      );
      this.coverage.executionStatus = "TIMEOUT_OR_ERROR";
      this.coverage.message =
        "Could not complete full test execution within timeout";
    }
  }

  // Parse test results from Jest output
  parseTestResults(output) {
    const lines = output.split("\n");

    lines.forEach((line) => {
      if (line.includes("Tests:") && line.includes("passed")) {
        const match = line.match(/(\d+)\s+passed.*?(\d+)\s+total/);
        if (match) {
          this.coverage.passedTests = parseInt(match[1]);
          this.coverage.totalTests = parseInt(match[2]);
          this.coverage.failedTests =
            this.coverage.totalTests - this.coverage.passedTests;
          this.coverage.passRate = Math.round(
            (this.coverage.passedTests / this.coverage.totalTests) * 100,
          );
        }
      }

      if (line.includes("Test Suites:") && line.includes("passed")) {
        const match = line.match(/(\d+)\s+passed.*?(\d+)\s+total/);
        if (match) {
          this.coverage.passedSuites = parseInt(match[1]);
          this.coverage.totalSuites = parseInt(match[2]);
          this.coverage.failedSuites =
            this.coverage.totalSuites - this.coverage.passedSuites;
          this.coverage.suitePassRate = Math.round(
            (this.coverage.passedSuites / this.coverage.totalSuites) * 100,
          );
        }
      }
    });
  }

  // Generate recommendations
  generateRecommendations() {
    console.log("\n💡 Generating recommendations...");

    // Coverage recommendations
    if (this.coverage.passRate < 90) {
      this.recommendations.push({
        category: "Test Pass Rate",
        priority: "High",
        issue: `Current pass rate is ${this.coverage.passRate || "unknown"}%`,
        recommendation:
          "Focus on fixing failing tests to achieve 90%+ pass rate",
      });
    }

    // Structure recommendations
    const categoryCounts = Object.keys(this.categories).length;
    if (categoryCounts < 5) {
      this.recommendations.push({
        category: "Test Coverage",
        priority: "Medium",
        issue: `Only ${categoryCounts} test categories found`,
        recommendation:
          "Consider adding more test categories (unit, integration, e2e, performance, security)",
      });
    }

    // Issue-based recommendations
    const filesWithIssues = this.testSuites.filter(
      (suite) => suite.issues.length > 0,
    );
    if (filesWithIssues.length > 0) {
      this.recommendations.push({
        category: "Code Quality",
        priority: "Medium",
        issue: `${filesWithIssues.length} test files have quality issues`,
        recommendation:
          "Review and fix test quality issues (console.log, missing assertions, etc.)",
      });
    }

    // Setup/teardown recommendations
    const filesWithoutSetup = this.testSuites.filter(
      (suite) => !suite.hasSetup && !suite.hasTeardown,
    );
    if (filesWithoutSetup.length > this.testSuites.length * 0.5) {
      this.recommendations.push({
        category: "Test Structure",
        priority: "Low",
        issue: "Many test files lack setup/teardown hooks",
        recommendation:
          "Consider adding beforeEach/afterEach hooks for better test isolation",
      });
    }
  }

  // Generate comprehensive report
  generateReport() {
    console.log("\n📊 Generating comprehensive audit report...");

    const report = {
      auditDate: new Date().toISOString(),
      summary: {
        totalTestFiles: this.testFiles.length,
        totalTestSuites: this.testSuites.length,
        totalTestCases: this.testCases.length,
        categories: Object.keys(this.categories).length,
        passRate: this.coverage.passRate || "Not determined",
        suitePassRate: this.coverage.suitePassRate || "Not determined",
      },
      categories: Object.keys(this.categories).map((cat) => ({
        name: cat,
        fileCount: this.categories[cat].length,
        testCount: this.categories[cat].reduce(
          (sum, file) => sum + file.tests.length,
          0,
        ),
      })),
      testFiles: this.testSuites.map((suite) => ({
        path: suite.path,
        category: suite.category,
        suiteCount: suite.suites.length,
        testCount: suite.tests.length,
        lineCount: suite.lineCount,
        hasSetup: suite.hasSetup,
        hasTeardown: suite.hasTeardown,
        hasMocks: suite.hasMocks,
        hasAsync: suite.hasAsync,
        issueCount: suite.issues.length,
        issues: suite.issues,
      })),
      coverage: this.coverage,
      issues: this.issues,
      recommendations: this.recommendations,
      detailedAnalysis: {
        filesWithIssues: this.testSuites.filter((s) => s.issues.length > 0)
          .length,
        filesWithMocks: this.testSuites.filter((s) => s.hasMocks).length,
        filesWithAsync: this.testSuites.filter((s) => s.hasAsync).length,
        filesWithSetup: this.testSuites.filter((s) => s.hasSetup).length,
        averageTestsPerFile: Math.round(
          this.testCases.length / this.testSuites.length,
        ),
      },
    };

    // Save JSON report
    fs.writeFileSync(
      path.join(process.cwd(), "comprehensive-test-audit-report.json"),
      JSON.stringify(report, null, 2),
    );

    // Generate markdown report
    this.generateMarkdownReport(report);

    return report;
  }

  // Generate markdown report
  generateMarkdownReport(report) {
    const markdown = `# Comprehensive Test Audit Report

## 📊 Executive Summary

- **Total Test Files**: ${report.summary.totalTestFiles}
- **Total Test Suites**: ${report.summary.totalTestSuites}
- **Total Test Cases**: ${report.summary.totalTestCases}
- **Test Categories**: ${report.summary.categories}
- **Current Pass Rate**: ${report.summary.passRate}%
- **Suite Pass Rate**: ${report.summary.suitePassRate}%

## 📂 Test Categories

${report.categories
  .map(
    (cat) =>
      `- **${cat.name}**: ${cat.fileCount} files, ${cat.testCount} test cases`,
  )
  .join("\n")}

## 🔍 Detailed Analysis

### Test File Quality
- Files with Issues: ${report.detailedAnalysis.filesWithIssues}/${report.summary.totalTestFiles}
- Files with Mocks: ${report.detailedAnalysis.filesWithMocks}/${report.summary.totalTestFiles}
- Files with Async Tests: ${report.detailedAnalysis.filesWithAsync}/${report.summary.totalTestFiles}
- Files with Setup/Teardown: ${report.detailedAnalysis.filesWithSetup}/${report.summary.totalTestFiles}
- Average Tests per File: ${report.detailedAnalysis.averageTestsPerFile}

### Test Files by Category

${report.categories
  .map((cat) => {
    const files = this.categories[cat.name];
    return `#### ${cat.name} (${cat.fileCount} files)
${files
  .map(
    (file) =>
      `- \`${file.path}\` - ${file.tests.length} tests${file.issues.length > 0 ? ` (${file.issues.length} issues)` : ""}`,
  )
  .join("\n")}`;
  })
  .join("\n\n")}

## ⚠️ Issues Found

${report.issues.length > 0 ? report.issues.map((issue) => `- ${issue}`).join("\n") : "No major issues found."}

### File-Specific Issues

${report.testFiles
  .filter((f) => f.issueCount > 0)
  .map(
    (file) =>
      `#### \`${file.path}\` (${file.issueCount} issues)
${file.issues.map((issue) => `- ${issue}`).join("\n")}`,
  )
  .join("\n\n")}

## 💡 Recommendations

${report.recommendations
  .map(
    (rec) =>
      `### ${rec.category} (Priority: ${rec.priority})
**Issue**: ${rec.issue}
**Recommendation**: ${rec.recommendation}`,
  )
  .join("\n\n")}

## 📈 Test Coverage Analysis

${
  report.coverage.passRate
    ? `
- **Test Pass Rate**: ${report.coverage.passRate}% (${report.coverage.passedTests}/${report.coverage.totalTests})
- **Suite Pass Rate**: ${report.coverage.suitePassRate}% (${report.coverage.passedSuites}/${report.coverage.totalSuites})
- **Failed Tests**: ${report.coverage.failedTests}
- **Failed Suites**: ${report.coverage.failedSuites}
`
    : "Test execution analysis could not be completed within timeout."
}

## 🎯 Next Steps

1. **Address High Priority Issues**: Focus on test failures and critical quality issues
2. **Improve Test Coverage**: Add missing test categories and increase coverage
3. **Enhance Test Quality**: Fix code quality issues and add missing assertions
4. **Optimize Performance**: Address timeout issues and improve execution speed
5. **Maintain Standards**: Establish test quality guidelines and review processes

---
*Generated on ${new Date().toISOString()}*
`;

    fs.writeFileSync(
      path.join(process.cwd(), "COMPREHENSIVE_TEST_AUDIT_REPORT.md"),
      markdown,
    );
  }

  // Main audit execution
  async execute() {
    console.log("🚀 Starting comprehensive test audit...\n");

    this.discoverTestFiles();
    this.analyzeTestStructure();
    await this.runExecutionAnalysis();
    this.generateRecommendations();
    const report = this.generateReport();

    console.log("\n✅ Audit completed successfully!");
    console.log(`📋 Reports generated:`);
    console.log(`   - comprehensive-test-audit-report.json`);
    console.log(`   - COMPREHENSIVE_TEST_AUDIT_REPORT.md`);

    return report;
  }
}

// Execute audit if run directly
if (require.main === module) {
  const auditor = new TestAuditor();
  auditor
    .execute()
    .then((report) => {
      console.log(
        `\n🎉 Audit Summary: ${report.summary.totalTestFiles} files, ${report.summary.totalTestCases} tests, ${report.summary.passRate}% pass rate`,
      );
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Audit failed:", error.message);
      process.exit(1);
    });
}

module.exports = { TestAuditor };
