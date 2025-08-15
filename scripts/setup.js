#!/usr/bin/env node

/**
 * Minimal test setup script
 */

const fs = require('fs');
const path = require('path');

console.log('[OK] Test setup starting...');

// Ensure required directories exist
const requiredDirs = [
  'test-results',
  'coverage',
  '__tests__/utils'
];

requiredDirs.forEach(dir => {
  const dirPath = path.join(process.cwd(), dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Ensure fixture files exist
const fixtureFiles = [
  '__tests__/fixtures/sample.json',
  '__tests__/fixtures/config.json'
];

fixtureFiles.forEach(fixture => {
  const fixturePath = path.join(process.cwd(), fixture);
  const fixtureDir = path.dirname(fixturePath);
  
  if (!fs.existsSync(fixtureDir)) {
    fs.mkdirSync(fixtureDir, { recursive: true });
  }
  
  if (!fs.existsSync(fixturePath)) {
    fs.writeFileSync(fixturePath, '{}');
  }
});

console.log('[OK] All fixture files are present.');
console.log('[OK] Test setup completed successfully.');
