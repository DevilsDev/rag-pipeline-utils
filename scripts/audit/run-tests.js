/**
 * Test Runner Script - Enterprise Audit
 * Captures test results, coverage, and quality metrics
 * Following ESLint standards established in project memory
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class TestRunner {
  constructor(rootPath) {
    this.rootPath = rootPath;
    this.results = {
      metadata: {
        timestamp: new Date().toISOString(),
        command: 'npm test',
        duration: 0,
        exitCode: null
      },
      summary: {
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
        suites: {
          total: 0,
          passed: 0,
          failed: 0
        }
      },
      suites: [],
      coverage: null,
      errors: [],
      warnings: []
    };
  }

  /**
   * Run test suite and capture results
   */
  async runTests() {
    console.log('🧪 Running test suite...');
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const testProcess = spawn('npm', ['test'], {
        cwd: this.rootPath,
        stdio: 'pipe',
        shell: true
      });
      
      let stdout = '';
      let stderr = '';
      
      testProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        process.stdout.write(output); // Show real-time output
      });
      
      testProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        process.stderr.write(output);
      });
      
      testProcess.on('close', (code) => {
        this.results.metadata.duration = Date.now() - startTime;
        this.results.metadata.exitCode = code;
        
        // Parse test output
        this.parseTestOutput(stdout, stderr);
        
        console.log(`✅ Test execution complete (exit code: ${code})`);
        console.log(`⏱️  Duration: ${this.results.metadata.duration}ms`);
        
        resolve(this.results);
      });
      
      testProcess.on('error', (error) => {
        this.results.errors.push({
          type: 'process_error',
          message: error.message,
          stack: error.stack
        });
        
        console.error('❌ Test process error:', error.message);
        resolve(this.results);
      });
    });
  }

  /**
   * Parse Jest/test output for metrics
   */
  parseTestOutput(stdout, stderr) {
    const output = stdout + stderr;
    
    // Parse Jest summary
    this.parseJestSummary(output);
    
    // Parse individual test suites
    this.parseTestSuites(output);
    
    // Parse coverage if available
    this.parseCoverage(output);
    
    // Extract errors and warnings
    this.parseErrorsAndWarnings(output);
  }

  /**
   * Parse Jest test summary
   */
  parseJestSummary(output) {
    // Jest summary patterns
    const testSummaryPattern = /Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/;
    const testSummaryPattern2 = /Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/;
    const suiteSummaryPattern = /Test Suites:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/;
    const suiteSummaryPattern2 = /Test Suites:\s+(\d+)\s+passed,\s+(\d+)\s+total/;
    
    let match = testSummaryPattern.exec(output);
    if (match) {
      this.results.summary.failedTests = parseInt(match[1]);
      this.results.summary.passedTests = parseInt(match[2]);
      this.results.summary.totalTests = parseInt(match[3]);
    } else {
      match = testSummaryPattern2.exec(output);
      if (match) {
        this.results.summary.passedTests = parseInt(match[1]);
        this.results.summary.totalTests = parseInt(match[2]);
        this.results.summary.failedTests = 0;
      }
    }
    
    match = suiteSummaryPattern.exec(output);
    if (match) {
      this.results.summary.suites.failed = parseInt(match[1]);
      this.results.summary.suites.passed = parseInt(match[2]);
      this.results.summary.suites.total = parseInt(match[3]);
    } else {
      match = suiteSummaryPattern2.exec(output);
      if (match) {
        this.results.summary.suites.passed = parseInt(match[1]);
        this.results.summary.suites.total = parseInt(match[2]);
        this.results.summary.suites.failed = 0;
      }
    }
  }

  /**
   * Parse individual test suites
   */
  parseTestSuites(output) {
    const suitePattern = /PASS|FAIL\s+(.+?\.(?:test|spec)\.js)/g;
    const suites = [];
    let match;
    
    while ((match = suitePattern.exec(output)) !== null) {
      const status = match[0].startsWith('PASS') ? 'passed' : 'failed';
      const suitePath = match[1];
      
      suites.push({
        name: path.basename(suitePath),
        path: suitePath,
        status: status,
        duration: this.extractSuiteDuration(output, suitePath)
      });
    }
    
    this.results.suites = suites;
  }

  /**
   * Extract suite duration from output
   */
  extractSuiteDuration(output, suitePath) {
    const durationPattern = new RegExp(`${suitePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*?(\\d+\\.?\\d*)\\s*s`, 'i');
    const match = durationPattern.exec(output);
    return match ? parseFloat(match[1]) * 1000 : null; // Convert to ms
  }

  /**
   * Parse coverage information
   */
  parseCoverage(output) {
    const coveragePattern = /All files\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)/;
    const match = coveragePattern.exec(output);
    
    if (match) {
      this.results.coverage = {
        statements: parseFloat(match[1]),
        branches: parseFloat(match[2]),
        functions: parseFloat(match[3]),
        lines: parseFloat(match[4])
      };
    }
  }

  /**
   * Extract errors and warnings
   */
  parseErrorsAndWarnings(output) {
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes('Error:') || line.includes('FAIL')) {
        this.results.errors.push({
          type: 'test_error',
          message: line.trim()
        });
      } else if (line.includes('Warning:') || line.includes('WARN')) {
        this.results.warnings.push({
          type: 'test_warning',
          message: line.trim()
        });
      }
    }
  }

  /**
   * Generate test quality report
   */
  generateQualityReport() {
    const passRate = this.results.summary.totalTests > 0 
      ? (this.results.summary.passedTests / this.results.summary.totalTests * 100).toFixed(1)
      : '0';
    
    const suitePassRate = this.results.summary.suites.total > 0
      ? (this.results.summary.suites.passed / this.results.summary.suites.total * 100).toFixed(1)
      : '0';
    
    const report = `# Testing Quality Report

## Test Execution Summary

- **Timestamp:** ${this.results.metadata.timestamp}
- **Duration:** ${this.results.metadata.duration}ms
- **Exit Code:** ${this.results.metadata.exitCode}

## Test Results

### Overall Statistics
- **Total Tests:** ${this.results.summary.totalTests}
- **Passed:** ${this.results.summary.passedTests} (${passRate}%)
- **Failed:** ${this.results.summary.failedTests}
- **Skipped:** ${this.results.summary.skippedTests}

### Test Suites
- **Total Suites:** ${this.results.summary.suites.total}
- **Passed:** ${this.results.summary.suites.passed} (${suitePassRate}%)
- **Failed:** ${this.results.summary.suites.failed}

${this.results.coverage ? `## Coverage Summary

- **Statements:** ${this.results.coverage.statements}%
- **Branches:** ${this.results.coverage.branches}%
- **Functions:** ${this.results.coverage.functions}%
- **Lines:** ${this.results.coverage.lines}%
` : `## Coverage
No coverage data available.`}

## Suite Details

${this.results.suites.map(suite => 
  `- **${suite.name}:** ${suite.status} ${suite.duration ? `(${suite.duration}ms)` : ''}`
).join('\n')}

${this.results.errors.length > 0 ? `## Errors (${this.results.errors.length})

${this.results.errors.slice(0, 10).map(error => `- ${error.message}`).join('\n')}
${this.results.errors.length > 10 ? `\n... and ${this.results.errors.length - 10} more errors` : ''}
` : ''}

${this.results.warnings.length > 0 ? `## Warnings (${this.results.warnings.length})

${this.results.warnings.slice(0, 5).map(warning => `- ${warning.message}`).join('\n')}
${this.results.warnings.length > 5 ? `\n... and ${this.results.warnings.length - 5} more warnings` : ''}
` : ''}

## Quality Assessment

- **Test Pass Rate:** ${passRate}% ${parseFloat(passRate) >= 90 ? '✅' : parseFloat(passRate) >= 70 ? '⚠️' : '❌'}
- **Suite Pass Rate:** ${suitePassRate}% ${parseFloat(suitePassRate) >= 90 ? '✅' : parseFloat(suitePassRate) >= 70 ? '⚠️' : '❌'}
${this.results.coverage ? `- **Coverage:** ${this.results.coverage.lines}% ${this.results.coverage.lines >= 80 ? '✅' : this.results.coverage.lines >= 60 ? '⚠️' : '❌'}` : ''}
`;
    
    return report;
  }

  /**
   * Run tests and generate reports
   */
  async executeTestAudit() {
    const results = await this.runTests();
    
    // Ensure output directory exists
    const reportsDir = path.join(this.rootPath, 'ci-reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    // Write JSON results
    fs.writeFileSync(
      path.join(reportsDir, 'test-results.json'),
      JSON.stringify(results, null, 2)
    );
    
    // Write quality report
    const qualityReport = this.generateQualityReport();
    fs.writeFileSync(
      path.join(reportsDir, 'testing-quality.md'),
      qualityReport
    );
    
    console.log('📁 Generated: ci-reports/test-results.json');
    console.log('📁 Generated: ci-reports/testing-quality.md');
    
    return results;
  }
}

// Execute if run directly
if (require.main === module) {
  const runner = new TestRunner(process.cwd());
  runner.executeTestAudit()
    .then(results => {
      const passRate = results.summary.totalTests > 0 
        ? (results.summary.passedTests / results.summary.totalTests * 100).toFixed(1)
        : '0';
      console.log(`🎯 Test Results: ${results.summary.passedTests}/${results.summary.totalTests} (${passRate}%)`);
      process.exit(results.metadata.exitCode || 0);
    })
    .catch(error => {
      console.error('❌ Test audit failed:', error);
      process.exit(1);
    });
}

module.exports = { TestRunner };
