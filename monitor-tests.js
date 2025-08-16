#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');

console.log('🚀 Starting comprehensive test execution with monitoring...');
console.log('📊 This will run all 49 test files across 13 categories\n');

const jest = spawn('npx', ['jest', '--verbose', '--forceExit'], {
  cwd: process.cwd(),
  stdio: 'pipe'
});

let output = '';
let _testCount = 0;
let _passedCount = 0;
let _failedCount = 0;

jest.stdout.on('data', (data) => {
  const chunk = data.toString();
  output += chunk;
  
  // Count test progress
  const passMatches = chunk.match(/✓/g);
  const failMatches = chunk.match(/✕/g);
  
  if (passMatches) _passedCount += passMatches.length;
  if (failMatches) _failedCount += failMatches.length;
  
  // Show progress for test suites
  if (chunk.includes('PASS') || chunk.includes('FAIL')) {
    process.stdout.write('.');
  }
  
  // Show major milestones
  if (chunk.includes('Test Suites:')) {
    console.log('\n📋 Test execution summary incoming...');
  }
});

jest.stderr.on('data', (data) => {
  const chunk = data.toString();
  output += chunk;
  if (chunk.includes('FAIL')) {
    process.stderr.write('F');
  }
});

jest.on('close', (code) => {
  console.log('\n\n' + '='.repeat(60));
  console.log('📊 COMPREHENSIVE TEST EXECUTION COMPLETE');
  console.log('='.repeat(60));
  
  // Parse final results
  const suitePassMatch = output.match(/Test Suites:\s+(\d+) passed/);
  const suiteFailMatch = output.match(/Test Suites:.*?(\d+) failed/);
  const testPassMatch = output.match(/Tests:\s+(\d+) passed/);
  const testFailMatch = output.match(/Tests:.*?(\d+) failed/);
  const totalTestMatch = output.match(/Tests:\s+(\d+) passed.*?(\d+) total/);
  
  if (suitePassMatch) {
    console.log(`✅ Test Suites Passed: ${suitePassMatch[1]}`);
  }
  if (suiteFailMatch) {
    console.log(`❌ Test Suites Failed: ${suiteFailMatch[1]}`);
  }
  if (testPassMatch) {
    console.log(`✅ Individual Tests Passed: ${testPassMatch[1]}`);
  }
  if (testFailMatch) {
    console.log(`❌ Individual Tests Failed: ${testFailMatch[1]}`);
  }
  
  // Calculate pass rate
  if (totalTestMatch) {
    const passed = parseInt(totalTestMatch[1]);
    const total = parseInt(totalTestMatch[2]);
    const passRate = ((passed / total) * 100).toFixed(1);
    console.log(`🎯 Pass Rate: ${passRate}%`);
    
    if (passRate === '100.0') {
      console.log('🎉 PERFECT SCORE: 100% PASS RATE ACHIEVED!');
    }
  }
  
  console.log(`🏁 Exit Code: ${code}`);
  console.log(code === 0 ? '🎉 ALL TESTS PASSED!' : '❌ Some tests failed');
  
  // Save results
  const results = {
    timestamp: new Date().toISOString(),
    exitCode: code,
    output: output,
    passedTests: testPassMatch ? parseInt(testPassMatch[1]) : 0,
    failedTests: testFailMatch ? parseInt(testFailMatch[1]) : 0,
    passRate: totalTestMatch ? ((parseInt(totalTestMatch[1]) / parseInt(totalTestMatch[2])) * 100).toFixed(1) : 'unknown'
  };
  
  fs.writeFileSync('test-execution-results.json', JSON.stringify(results, null, 2));
  console.log('\n📄 Results saved to test-execution-results.json');
});
