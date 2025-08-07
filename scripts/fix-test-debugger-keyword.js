#!/usr/bin/env node
/**
 * Enterprise CI/CD Recovery - Comprehensive Test File Fix
 * Fixes all instances of reserved keyword 'debugger' in test files
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Comprehensive Test File Fix - Reserved Keyword Cleanup...');

const testFile = '__tests__/dx/dx-enhancements.test.js';

if (!fs.existsSync(testFile)) {
  console.log(`⚠️ Test file not found: ${testFile}`);
  process.exit(1);
}

let content = fs.readFileSync(testFile, 'utf8');
let modified = false;

// Replace all instances of 'debugger' variable with 'realtimeDebugger'
// But preserve actual debugger statements (which should be rare in tests)
const patterns = [
  // Variable declarations
  { from: /const debugger = /g, to: 'const realtimeDebugger = ' },
  { from: /let debugger = /g, to: 'let realtimeDebugger = ' },
  { from: /var debugger = /g, to: 'var realtimeDebugger = ' },
  
  // Method calls and property access
  { from: /debugger\./g, to: 'realtimeDebugger.' },
  { from: /debugger\[/g, to: 'realtimeDebugger[' },
  
  // Function parameters (less common but possible)
  { from: /\(debugger\)/g, to: '(realtimeDebugger)' },
  { from: /\(debugger,/g, to: '(realtimeDebugger,' },
  { from: /, debugger\)/g, to: ', realtimeDebugger)' },
  { from: /, debugger,/g, to: ', realtimeDebugger,' },
  
  // Assignment operations
  { from: /debugger =/g, to: 'realtimeDebugger =' },
  
  // Return statements
  { from: /return debugger;/g, to: 'return realtimeDebugger;' },
  { from: /return debugger\./g, to: 'return realtimeDebugger.' }
];

patterns.forEach(({ from, to }) => {
  const originalContent = content;
  content = content.replace(from, to);
  if (content !== originalContent) {
    modified = true;
    console.log(`  ✅ Applied pattern: ${from} → ${to}`);
  }
});

// Special case: Handle any remaining standalone 'debugger' references that aren't the debugger statement
// We need to be careful not to replace actual debugger; statements
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Skip lines that contain the actual debugger statement
  if (line.trim() === 'debugger;' || line.includes('debugger;')) {
    continue;
  }
  
  // Replace other debugger references
  if (line.includes('debugger') && !line.includes('realtimeDebugger')) {
    const originalLine = line;
    lines[i] = line.replace(/\bdebugger\b/g, 'realtimeDebugger');
    if (lines[i] !== originalLine) {
      modified = true;
      console.log(`  ✅ Fixed line ${i + 1}: ${originalLine.trim()} → ${lines[i].trim()}`);
    }
  }
}

if (modified) {
  content = lines.join('\n');
  fs.writeFileSync(testFile, content);
  console.log(`📝 Updated: ${testFile}`);
  console.log('🎉 Comprehensive test file fix completed!');
} else {
  console.log('ℹ️ No changes needed - file already clean');
}

console.log('\n🔍 Verifying fix by checking for remaining issues...');

// Quick verification
const remainingIssues = content.match(/\bdebugger\s*[^;]/g);
if (remainingIssues && remainingIssues.length > 0) {
  console.log(`⚠️ Found ${remainingIssues.length} potential remaining issues:`);
  remainingIssues.forEach((issue, index) => {
    console.log(`  ${index + 1}. ${issue}`);
  });
} else {
  console.log('✅ No remaining debugger keyword issues found!');
}
