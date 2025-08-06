/**
 * AI/ML Test Diagnostic Script
 * Captures detailed test failures for systematic fixing
 */

const { spawn } = require('child_process');
const fs = require('fs');

console.log('🔍 Running AI/ML test diagnostics...\n');

const testProcess = spawn('npx', [
  'jest', 
  '__tests__/ai/advanced-ai-capabilities.test.js', 
  '--verbose', 
  '--no-coverage',
  '--no-cache',
  '--detectOpenHandles'
], {
  cwd: process.cwd(),
  stdio: 'pipe'
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
  console.log(`\n📊 Test process exited with code: ${code}`);
  
  // Save detailed output to file
  const fullOutput = `=== STDOUT ===\n${output}\n\n=== STDERR ===\n${errorOutput}`;
  fs.writeFileSync('ai-test-diagnostics.log', fullOutput);
  
  console.log('📝 Full test output saved to: ai-test-diagnostics.log');
  
  // Extract and display key information
  const lines = output.split('\n');
  const failedTests = lines.filter(line => 
    line.includes('✕') || 
    line.includes('FAIL') || 
    line.includes('Error:') ||
    line.includes('Expected:') ||
    line.includes('Received:')
  );
  
  if (failedTests.length > 0) {
    console.log('\n🚨 Key Test Failures:');
    failedTests.slice(0, 20).forEach(line => {
      console.log(`  ${line.trim()}`);
    });
  }
  
  // Summary
  const summaryMatch = output.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/);
  if (summaryMatch) {
    const [, failed, passed, total] = summaryMatch;
    console.log(`\n📈 Test Summary: ${passed}/${total} passed, ${failed} failed`);
    console.log(`📊 Success Rate: ${Math.round((passed/total) * 100)}%`);
  }
  
  process.exit(code);
});
