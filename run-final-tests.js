#!/usr/bin/env node

/**
 * Simple Final Test Execution
 * Direct Jest execution for final validation
 */

const { execSync } = require('child_process');
const fs = require('fs');

console.log('🚀 Executing Final Test Suite Validation...');
console.log('📊 Measuring current pass rate after all stabilization work\n');

const startTime = Date.now();

try {
  // Try different Jest execution methods
  let testCommand;
  let result;
  
  try {
    // Method 1: Direct jest from node_modules
    testCommand = 'node_modules\\.bin\\jest --testTimeout=30000 --maxWorkers=1 --verbose --forceExit';
    console.log('⚡ Attempting direct Jest execution...');
    result = execSync(testCommand, { 
      cwd: process.cwd(), 
      encoding: 'utf8',
      timeout: 300000, // 5 minutes
      stdio: 'pipe'
    });
  } catch (error) {
    try {
      // Method 2: npm test script
      testCommand = 'npm test';
      console.log('⚡ Attempting npm test execution...');
      result = execSync(testCommand, { 
        cwd: process.cwd(), 
        encoding: 'utf8',
        timeout: 300000,
        stdio: 'pipe'
      });
    } catch (npmError) {
      // Method 3: Direct node jest execution
      testCommand = 'node node_modules/jest/bin/jest.js --testTimeout=30000 --maxWorkers=1 --verbose --forceExit';
      console.log('⚡ Attempting direct node jest execution...');
      result = execSync(testCommand, { 
        cwd: process.cwd(), 
        encoding: 'utf8',
        timeout: 300000,
        stdio: 'pipe'
      });
    }
  }

  const executionTime = Date.now() - startTime;
  
  // Parse results
  const testResults = parseJestOutput(result);
  testResults.executionTime = executionTime;
  testResults.timestamp = new Date().toISOString();
  
  // Generate report
  generateFinalReport(testResults);
  
} catch (error) {
  console.error('❌ All test execution methods failed:', error.message);
  
  // Generate error report with recommendations
  const errorReport = {
    timestamp: new Date().toISOString(),
    error: error.message,
    executionTime: Date.now() - startTime,
    status: 'execution_failed',
    recommendations: [
      'Verify Jest is installed: npm list jest',
      'Check Node.js and npm are properly configured',
      'Try manual test execution: npm test',
      'Review package.json test script configuration'
    ]
  };
  
  fs.writeFileSync('test-execution-error.json', JSON.stringify(errorReport, null, 2));
  
  console.log('\n📋 Error Report Generated:');
  console.log('  - test-execution-error.json');
  console.log('\n🔧 Recommended Actions:');
  errorReport.recommendations.forEach(rec => console.log(`  - ${rec}`));
  
  process.exit(1);
}

function parseJestOutput(output) {
  const results = {
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    passedSuites: 0,
    failedSuites: 0,
    passRate: 0,
    output: output,
    status: 'unknown'
  };

  // Parse test summary
  const testMatch = output.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/);
  if (testMatch) {
    results.failedTests = parseInt(testMatch[1]);
    results.passedTests = parseInt(testMatch[2]);
    results.totalTests = parseInt(testMatch[3]);
  } else {
    // Alternative parsing
    const passedMatch = output.match(/(\d+)\s+passed/);
    const failedMatch = output.match(/(\d+)\s+failed/);
    
    if (passedMatch) results.passedTests = parseInt(passedMatch[1]);
    if (failedMatch) results.failedTests = parseInt(failedMatch[1]);
    results.totalTests = results.passedTests + results.failedTests;
  }

  // Parse suite summary
  const suiteMatch = output.match(/Test Suites:\s+(\d+)\s+failed,\s+(\d+)\s+passed/);
  if (suiteMatch) {
    results.failedSuites = parseInt(suiteMatch[1]);
    results.passedSuites = parseInt(suiteMatch[2]);
  }

  // Calculate pass rate
  if (results.totalTests > 0) {
    results.passRate = Math.round((results.passedTests / results.totalTests) * 100);
  }

  // Determine status
  if (results.totalTests === 0) {
    results.status = 'no_tests';
  } else if (results.failedTests === 0) {
    results.status = 'all_passed';
  } else {
    results.status = 'partial_success';
  }

  return results;
}

function generateFinalReport(results) {
  // Save detailed JSON report
  fs.writeFileSync('final-test-results.json', JSON.stringify(results, null, 2));

  // Generate markdown report
  const markdownReport = `# Final Test Suite Validation Results

**Generated:** ${results.timestamp}  
**Execution Time:** ${Math.round(results.executionTime / 1000)}s

## Test Results

| Metric | Value |
|--------|-------|
| **Total Tests** | ${results.totalTests} |
| **Passed Tests** | ${results.passedTests} |
| **Failed Tests** | ${results.failedTests} |
| **Pass Rate** | **${results.passRate}%** |
| **Passed Suites** | ${results.passedSuites} |
| **Failed Suites** | ${results.failedSuites} |

## Status Assessment

${results.passRate === 100 
  ? '🎉 **MILESTONE ACHIEVED**: 100% test pass rate reached!'
  : `📊 **PROGRESS**: ${results.passRate}% pass rate achieved after comprehensive stabilization.`
}

## Next Steps

${results.passRate === 100 
  ? `- Proceed to comprehensive audit phase
- Generate final QA documentation
- Prepare production readiness signoff`
  : `- Analyze remaining ${results.failedTests} test failures
- Apply targeted micro-fixes for specific issues
- Continue systematic stabilization work`
}

## Summary

After completing all systematic stabilization phases (Batches 1-5, comprehensive fixes, targeted micro-fixes), the test suite shows **${results.passRate}% pass rate** with ${results.passedTests}/${results.totalTests} tests passing.

${results.status === 'all_passed' 
  ? 'All stabilization work has successfully achieved the 100% pass rate milestone.'
  : 'Significant progress made through systematic stabilization. Final targeted fixes needed for remaining failures.'
}
`;

  fs.writeFileSync('FINAL_TEST_RESULTS.md', markdownReport);

  // Console output
  console.log('\n' + '='.repeat(60));
  console.log('📋 FINAL TEST SUITE VALIDATION RESULTS');
  console.log('='.repeat(60));
  console.log(`📊 Total Tests: ${results.totalTests}`);
  console.log(`✅ Passed: ${results.passedTests}`);
  console.log(`❌ Failed: ${results.failedTests}`);
  console.log(`📈 Pass Rate: ${results.passRate}%`);
  console.log(`⏱️  Execution Time: ${Math.round(results.executionTime / 1000)}s`);
  console.log(`📁 Test Suites: ${results.passedSuites} passed, ${results.failedSuites} failed`);

  if (results.passRate === 100) {
    console.log('\n🎉 MILESTONE ACHIEVED: 100% TEST PASS RATE!');
    console.log('✅ Ready for comprehensive audit and final QA signoff');
  } else {
    console.log(`\n🎯 Progress: ${results.passRate}% toward 100% target`);
    console.log(`📋 ${results.failedTests} test failures remaining for targeted fixes`);
  }

  console.log('\n📄 Reports Generated:');
  console.log('  - final-test-results.json');
  console.log('  - FINAL_TEST_RESULTS.md');
}

console.log('\n✅ Final test validation completed');
