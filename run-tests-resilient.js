#!/usr/bin/env node

/**
 * Resilient Test Runner - Final QA Milestone
 * Guardrails: Track failures, avoid infinite loops, comprehensive logging
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🧪 Starting Resilient Test Matrix Execution...');

const testResults = {
  timestamp: new Date().toISOString(),
  totalTests: 0,
  passedTests: 0,
  failedTests: 0,
  totalSuites: 0,
  passedSuites: 0,
  failedSuites: 0,
  executionTime: 0,
  failureCategories: {
    performance: [],
    async: [],
    mocking: [],
    implementation: [],
    environment: []
  },
  unresolvedTests: [],
  retryLog: []
};

function categorizeFailure(testName, error) {
  const errorMsg = error.toLowerCase();
  
  if (errorMsg.includes('timeout') || errorMsg.includes('async') || errorMsg.includes('promise')) {
    return 'async';
  } else if (errorMsg.includes('mock') || errorMsg.includes('stub') || errorMsg.includes('spy')) {
    return 'mocking';
  } else if (errorMsg.includes('performance') || errorMsg.includes('benchmark') || errorMsg.includes('memory')) {
    return 'performance';
  } else if (errorMsg.includes('not defined') || errorMsg.includes('is not a function') || errorMsg.includes('cannot read property')) {
    return 'implementation';
  } else {
    return 'environment';
  }
}

function runTestMatrix() {
  const startTime = Date.now();
  
  try {
    console.log('📊 Running full test matrix...');
    
    // Run tests with JSON output for structured analysis
    const testOutput = execSync('npm test -- --json --verbose', {
      cwd: __dirname,
      encoding: 'utf8',
      timeout: 300000 // 5 minute timeout
    });
    
    // Parse Jest JSON output
    try {
      const jestResults = JSON.parse(testOutput);
      
      testResults.totalTests = jestResults.numTotalTests || 0;
      testResults.passedTests = jestResults.numPassedTests || 0;
      testResults.failedTests = jestResults.numFailedTests || 0;
      testResults.totalSuites = jestResults.numTotalTestSuites || 0;
      testResults.passedSuites = jestResults.numPassedTestSuites || 0;
      testResults.failedSuites = jestResults.numFailedTestSuites || 0;
      testResults.executionTime = Date.now() - startTime;
      
      // Process test results for failure categorization
      if (jestResults.testResults) {
        jestResults.testResults.forEach(suiteResult => {
          if (suiteResult.status === 'failed') {
            suiteResult.assertionResults?.forEach(testResult => {
              if (testResult.status === 'failed') {
                const category = categorizeFailure(testResult.title, testResult.failureMessages?.[0] || '');
                testResults.failureCategories[category].push({
                  suite: suiteResult.name,
                  test: testResult.title,
                  error: testResult.failureMessages?.[0] || 'Unknown error',
                  duration: testResult.duration || 0
                });
              }
            });
          }
        });
      }
      
    } catch (parseError) {
      console.log('⚠️ Could not parse Jest JSON output, using fallback metrics');
      // Fallback: parse from stdout
      const lines = testOutput.split('\n');
      const summaryLine = lines.find(line => line.includes('Tests:') && line.includes('passed'));
      if (summaryLine) {
        const matches = summaryLine.match(/(\d+) failed, (\d+) passed, (\d+) total/);
        if (matches) {
          testResults.failedTests = parseInt(matches[1]) || 0;
          testResults.passedTests = parseInt(matches[2]) || 0;
          testResults.totalTests = parseInt(matches[3]) || 0;
        }
      }
    }
    
  } catch (error) {
    // Tests failed, but we still want to capture what we can
    console.log('⚠️ Test execution completed with failures');
    
    const output = error.stdout || error.message || '';
    const lines = output.split('\n');
    
    // Try to extract metrics from error output
    const summaryLine = lines.find(line => line.includes('Tests:') || line.includes('Test Suites:'));
    if (summaryLine) {
      console.log(`📊 Found summary: ${summaryLine}`);
      
      // Parse test counts from summary
      const testMatch = summaryLine.match(/(\d+) failed, (\d+) passed, (\d+) total/);
      if (testMatch) {
        testResults.failedTests = parseInt(testMatch[1]) || 0;
        testResults.passedTests = parseInt(testMatch[2]) || 0;
        testResults.totalTests = parseInt(testMatch[3]) || 0;
      }
      
      // Parse suite counts
      const suiteMatch = output.match(/Test Suites: (\d+) failed, (\d+) passed, (\d+) total/);
      if (suiteMatch) {
        testResults.failedSuites = parseInt(suiteMatch[1]) || 0;
        testResults.passedSuites = parseInt(suiteMatch[2]) || 0;
        testResults.totalSuites = parseInt(suiteMatch[3]) || 0;
      }
    }
    
    testResults.executionTime = Date.now() - startTime;
  }
  
  return testResults;
}

// Execute test matrix
const results = runTestMatrix();

// Log results
console.log('\n📊 Test Matrix Results:');
console.log(`📈 Tests: ${results.passedTests}/${results.totalTests} passed (${((results.passedTests/results.totalTests)*100).toFixed(1)}%)`);
console.log(`📦 Suites: ${results.passedSuites}/${results.totalSuites} passed (${((results.passedSuites/results.totalSuites)*100).toFixed(1)}%)`);
console.log(`⏱️ Execution Time: ${(results.executionTime/1000).toFixed(1)}s`);

// Log failure categories
console.log('\n🔍 Failure Categories:');
Object.entries(results.failureCategories).forEach(([category, failures]) => {
  if (failures.length > 0) {
    console.log(`  ${category}: ${failures.length} failures`);
  }
});

// Save detailed results for audit report
fs.writeFileSync(
  path.join(__dirname, 'test-matrix-results.json'),
  JSON.stringify(results, null, 2)
);

console.log('\n✅ Test matrix execution complete!');
console.log('📋 Detailed results saved to test-matrix-results.json');

// Return exit code based on test success
process.exit(results.failedTests > 0 ? 1 : 0);
