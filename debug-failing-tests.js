/**
 * Targeted AI/ML Test Failure Diagnostic Script
 * Identifies specific failing tests and their error details
 */

const { spawn } = require('child_process');

console.log('🔍 Running targeted AI/ML test failure analysis...\n');

const testProcess = spawn('npm', [
  'test', 
  '__tests__/ai/advanced-ai-capabilities.test.js',
  '--',
  '--verbose',
  '--no-coverage',
  '--bail=false'
], {
  cwd: process.cwd(),
  stdio: 'pipe',
  shell: true
});

let output = '';
let errorOutput = '';

testProcess.stdout.on('data', (data) => {
  const chunk = data.toString();
  output += chunk;
  process.stdout.write(chunk);
});

testProcess.stderr.on('data', (data) => {
  const chunk = data.toString();
  errorOutput += chunk;
  process.stderr.write(chunk);
});

testProcess.on('close', (code) => {
  console.log(`\n📊 Test Analysis Complete (exit code: ${code})`);
  
  // Extract failing test information
  const lines = output.split('\n');
  const failingTests = [];
  let currentTest = null;
  let collectingError = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect failing test start
    if (line.includes('✕') && !line.includes('✓')) {
      currentTest = {
        name: line.replace('✕', '').trim(),
        errors: []
      };
      collectingError = true;
      failingTests.push(currentTest);
    }
    
    // Collect error details
    if (collectingError && currentTest) {
      if (line.includes('Expected:') || line.includes('Received:') || 
          line.includes('Error:') || line.includes('TypeError:') ||
          line.includes('ReferenceError:')) {
        currentTest.errors.push(line.trim());
      }
      
      // Stop collecting when we hit the next test or summary
      if ((line.includes('✕') || line.includes('✓')) && 
          !line.includes(currentTest.name.split(' ')[0])) {
        collectingError = false;
        currentTest = null;
      }
    }
  }
  
  // Display failing test summary
  if (failingTests.length > 0) {
    console.log('\n🚨 FAILING TESTS ANALYSIS:');
    console.log('=' .repeat(50));
    
    failingTests.forEach((test, index) => {
      console.log(`\n${index + 1}. ${test.name}`);
      if (test.errors.length > 0) {
        test.errors.forEach(error => {
          console.log(`   ${error}`);
        });
      } else {
        console.log('   (No specific error details captured)');
      }
    });
    
    console.log(`\n📈 SUMMARY: ${failingTests.length} tests failing`);
    console.log('🎯 Focus areas for fixes:');
    
    // Analyze common failure patterns
    const errorPatterns = failingTests.flatMap(t => t.errors).join(' ');
    if (errorPatterns.includes('Expected') && errorPatterns.includes('Received')) {
      console.log('   - Property/value mismatches in return objects');
    }
    if (errorPatterns.includes('TypeError')) {
      console.log('   - Type-related errors (undefined methods/properties)');
    }
    if (errorPatterns.includes('timeout') || errorPatterns.includes('async')) {
      console.log('   - Async/timing related issues');
    }
  } else {
    console.log('\n✅ No failing tests detected in output parsing');
  }
  
  // Extract test summary
  const summaryMatch = output.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/);
  if (summaryMatch) {
    const [, failed, passed, total] = summaryMatch;
    console.log(`\n📊 CURRENT STATUS: ${passed}/${total} tests passing (${Math.round((passed/total) * 100)}%)`);
    console.log(`🎯 TARGET: Fix remaining ${failed} tests to achieve 100% completion`);
  }
  
  process.exit(code);
});
