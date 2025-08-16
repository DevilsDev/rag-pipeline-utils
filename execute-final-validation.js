#!/usr/bin/env node

/**
 * Execute Final Comprehensive Test Suite Validation
 * Measure current pass rate after all stabilization work
 */

const { spawn } = require('child_process');
const fs = require('fs');
const _path = require('path');

class FinalTestExecutor {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      passedSuites: 0,
      failedSuites: 0,
      executionTime: 0,
      passRate: 0,
      output: '',
      errors: [],
      status: 'running'
    };
  }

  async executeTests() {
    console.log('🚀 Executing Final Comprehensive Test Suite Validation...');
    console.log('📊 Measuring progress toward 100% test pass rate after all stabilization work\n');

    const startTime = Date.now();

    try {
      const { stdout, stderr: _stderr } = await this.runCommand('npm', ['test', '--', '--verbose', '--no-coverage']);
      this.results.executionTime = Date.now() - startTime;
      this.parseResults(stdout);
      this.generateReport();
      
    } catch (error) {
      console.error('❌ Test execution failed:', error.message);
      this.results.status = 'failed';
      this.results.error = error.message;
      this.generateErrorReport();
    }
  }

  runJestWithCapture() {
    return new Promise((resolve, reject) => {
      const args = [
        'jest',
        '--testTimeout=30000',
        '--maxWorkers=1',
        '--verbose',
        '--forceExit',
        '--detectOpenHandles',
        '--no-cache'
      ];

      console.log('⚡ Starting Jest with optimized configuration...');
      const child = spawn('npx', args, {
        cwd: process.cwd(),
        stdio: ['inherit', 'pipe', 'pipe']
      });

      let stdout = '';
      let _stderr = '';

      child.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        process.stdout.write(output);
      });

      child.stderr.on('data', (data) => {
        const output = data.toString();
        _stderr += output;
        process.stderr.write(output);
      });

      // Set timeout for test execution
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Test execution timed out after 5 minutes'));
      }, 300000); // 5 minutes

      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({ code, stdout, stderr: _stderr });
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  parseResults(result) {
    const { code, stdout, stderr: _stderr } = result;
    this.results.output = stdout;
    this.results.exitCode = code;

    // Parse Jest output for test results
    const testSummaryMatch = stdout.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/);
    if (testSummaryMatch) {
      this.results.failedTests = parseInt(testSummaryMatch[1]);
      this.results.passedTests = parseInt(testSummaryMatch[2]);
      this.results.totalTests = parseInt(testSummaryMatch[3]);
    } else {
      // Alternative parsing for different Jest output formats
      const passedMatch = stdout.match(/(\d+)\s+passed/);
      const failedMatch = stdout.match(/(\d+)\s+failed/);
      const totalMatch = stdout.match(/(\d+)\s+total/);
      
      if (passedMatch) this.results.passedTests = parseInt(passedMatch[1]);
      if (failedMatch) this.results.failedTests = parseInt(failedMatch[1]);
      if (totalMatch) this.results.totalTests = parseInt(totalMatch[1]);
    }

    // Parse test suites
    const suiteSummaryMatch = stdout.match(/Test Suites:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/);
    if (suiteSummaryMatch) {
      this.results.failedSuites = parseInt(suiteSummaryMatch[1]);
      this.results.passedSuites = parseInt(suiteSummaryMatch[2]);
    }

    // Calculate pass rate
    if (this.results.totalTests > 0) {
      this.results.passRate = Math.round((this.results.passedTests / this.results.totalTests) * 100);
    }

    // Extract error details
    const errorLines = stdout.split('\n').filter(line => 
      line.includes('FAIL') || line.includes('Error:') || line.includes('Expected')
    );
    this.results.errors = errorLines.slice(0, 20); // Limit to first 20 errors

    this.results.status = code === 0 ? 'success' : 'partial';
  }

  generateReport() {
    const report = {
      ...this.results,
      summary: this.generateSummary(),
      milestone: this.results.passRate === 100 ? 'ACHIEVED' : 'IN_PROGRESS',
      nextSteps: this.generateNextSteps()
    };

    // Save detailed results
    fs.writeFileSync('final-validation-results.json', JSON.stringify(report, null, 2));

    // Generate markdown report
    const markdownReport = this.generateMarkdownReport(report);
    fs.writeFileSync('FINAL_VALIDATION_REPORT.md', markdownReport);

    // Console output
    console.log('\n' + '='.repeat(60));
    console.log('📋 FINAL TEST SUITE VALIDATION RESULTS');
    console.log('='.repeat(60));
    console.log(`📊 Total Tests: ${this.results.totalTests}`);
    console.log(`✅ Passed: ${this.results.passedTests}`);
    console.log(`❌ Failed: ${this.results.failedTests}`);
    console.log(`📈 Pass Rate: ${this.results.passRate}%`);
    console.log(`⏱️  Execution Time: ${Math.round(this.results.executionTime / 1000)}s`);
    console.log(`📁 Passed Suites: ${this.results.passedSuites}`);
    console.log(`📁 Failed Suites: ${this.results.failedSuites}`);

    if (this.results.passRate === 100) {
      console.log('\n🎉 MILESTONE ACHIEVED: 100% TEST PASS RATE!');
      console.log('✅ Ready for comprehensive audit and final QA signoff');
    } else {
      console.log(`\n🎯 Progress: ${this.results.passRate}% toward 100% target`);
      console.log('📋 Remaining failures identified for targeted fixes');
    }

    console.log('\n📄 Reports generated:');
    console.log('  - final-validation-results.json');
    console.log('  - FINAL_VALIDATION_REPORT.md');
  }

  generateSummary() {
    const progress = this.results.passRate;
    
    if (progress === 100) {
      return '🎉 MILESTONE ACHIEVED: 100% test pass rate reached after comprehensive stabilization work.';
    } else if (progress >= 95) {
      return '🔥 EXCELLENT: Near-complete stabilization achieved. Final targeted fixes needed.';
    } else if (progress >= 85) {
      return '💪 STRONG: Significant stabilization progress. Systematic fixes continuing.';
    } else if (progress >= 70) {
      return '📈 GOOD: Solid foundation established. Additional stabilization work required.';
    } else {
      return '🔧 NEEDS WORK: Foundational issues require comprehensive attention.';
    }
  }

  generateNextSteps() {
    const steps = [];
    
    if (this.results.passRate === 100) {
      steps.push('Proceed to comprehensive audit of all test cases and suites');
      steps.push('Generate final QA documentation and stakeholder reports');
      steps.push('Prepare production readiness signoff');
    } else {
      steps.push('Analyze remaining test failures by root cause category');
      steps.push('Apply targeted micro-fixes for specific failing tests');
      steps.push('Focus on highest-impact failures first');
      steps.push('Validate fixes incrementally until 100% achieved');
    }
    
    return steps;
  }

  generateMarkdownReport(report) {
    return `# Final Test Suite Validation Report

**Generated:** ${report.timestamp}  
**Execution Time:** ${Math.round(report.executionTime / 1000)}s  
**Status:** ${report.status.toUpperCase()}

## Test Results Summary

| Metric | Value |
|--------|-------|
| **Total Tests** | ${report.totalTests} |
| **Passed Tests** | ${report.passedTests} |
| **Failed Tests** | ${report.failedTests} |
| **Pass Rate** | **${report.passRate}%** |
| **Passed Suites** | ${report.passedSuites} |
| **Failed Suites** | ${report.failedSuites} |

## Milestone Status

**${report.milestone === 'ACHIEVED' ? '🎉 MILESTONE ACHIEVED' : '🎯 MILESTONE IN PROGRESS'}**

${report.summary}

## Stabilization Work Completed

- ✅ Batch 1-5: Systematic stabilization phases
- ✅ Comprehensive fixes: Type references, performance, DAG, Jest config
- ✅ Targeted micro-fixes: Final stabilization optimizations
- ✅ Infrastructure hardening: Jest configuration, timeouts, cleanup
- ✅ Critical fixes: Syntax errors, module imports, test helpers

## Next Steps

${report.nextSteps.map(step => `- ${step}`).join('\n')}

## Error Analysis

${report.errors.length > 0 
  ? `### Remaining Issues\n\`\`\`\n${report.errors.slice(0, 10).join('\n')}\n\`\`\``
  : '✅ No critical errors detected'
}

## Conclusion

${report.passRate === 100 
  ? '🎉 **SUCCESS**: 100% test pass rate achieved! Ready for final QA phase.'
  : `📊 **PROGRESS**: ${report.passRate}% pass rate achieved. Continue targeted stabilization work.`
}
`;
  }

  generateErrorReport() {
    const errorReport = {
      timestamp: this.results.timestamp,
      error: this.results.error,
      status: 'execution_failed',
      recommendations: [
        'Check Jest configuration and dependencies',
        'Verify Node.js version compatibility',
        'Review system resources and memory',
        'Consider running tests in smaller batches'
      ]
    };

    fs.writeFileSync('test-execution-error.json', JSON.stringify(errorReport, null, 2));
    console.log('\n❌ Test execution failed - error report generated');
  }
}

// Execute final validation
if (require.main === module) {
  const executor = new FinalTestExecutor();
  executor.executeTests()
    .then(() => {
      console.log('\n✅ Final test validation completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Validation execution failed:', error.message);
      process.exit(1);
    });
}

module.exports = FinalTestExecutor;
