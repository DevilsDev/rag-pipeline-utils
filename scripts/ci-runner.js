/**
 * Version: 1.0.1
 * Description: CI runner for linting, testing, and coverage with fixture validation
 * Author: Ali Kahwaji
 */

import { execSync } from 'child_process';

try {
  console.log('[ci] Running fixture validation...');
  execSync('node scripts/verify-fixtures.js', { stdio: 'inherit' });

  console.log('[ci] Running linter...');
  execSync('npx eslint . --ext .js,.mjs', { stdio: 'inherit' });

  console.log('[ci] Running tests...');
  execSync('npm test', { stdio: 'inherit' });

  console.log('[ci] All steps completed successfully.');
} catch (error) {
  console.error('[ci] CI pipeline failed:', error.message);
  process.exit(1);
}
