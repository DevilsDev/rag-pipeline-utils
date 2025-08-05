/**
 * Version: 1.1.0
 * Description: CI runner for linting, mock validation, testing and coverage
 * Author: Ali Kahwaji
 * File: scripts/ci-runner.js
 */

import { execSync } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';
// import fs from 'fs'; // Reserved for future file operations

// Entry helpers
const ROOT = path.resolve();
const resolveScript = (relPath) => pathToFileURL(path.resolve(ROOT, relPath)).href;

const run = (label, command) => {
  console.log(`\n🔧 Running: ${label}`);
  try {
    execSync(command, { stdio: 'inherit', cwd: ROOT });
    console.log(`✅ ${label} passed`);
  } catch (err) {
    console.error(`❌ ${label} failed`);
    process.exit(1);
  }
};

const runDynamicModule = async (label, modulePath) => {
  console.log(`\n🔍 Validating: ${label}`);
  try {
    const mod = await import(resolveScript(modulePath));
    if (typeof mod.default === 'function') await mod.default();
    console.log(`✅ ${label} passed`);
  } catch (err) {
    console.error(`❌ ${label} failed:\n${err.message}`);
    process.exit(1);
  }
};

(async () => {
  // Step 1: Lint
  run('Lint', 'npx eslint . --ext .js,.ts');

  // Step 2: Verify mocks for required interface methods
  await runDynamicModule('Fixture Mock Interface Validation', 'scripts/verify-fixture-mocks.js');

  // Step 3: Test and coverage
  run('Unit + Integration Tests w/ Coverage', 'cross-env NODE_OPTIONS=--experimental-vm-modules jest --coverage');

  console.log('\n🎉 CI runner completed successfully.\n');
})();
