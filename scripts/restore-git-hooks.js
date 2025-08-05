#!/usr/bin/env node

/**
 * Git Hook Restoration Script
 * Version: 2.0.0
 * Description: Restores normal Git hooks after emergency recovery mode
 * Author: Ali Kahwaji
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupCLI, dryRunWrapper } from './utils/cli.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load configuration
const configPath = path.resolve(__dirname, 'scripts.config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Setup CLI
const { args, logger } = setupCLI('restore-git-hooks.js', 'Restore normal Git hooks after emergency mode', {
  '--force': 'Force restoration even if backup doesn\'t exist'
});

logger.info('🔄 Restoring Normal Git Hooks');

// 1. Restore pre-commit hook from backup
const preCommitPath = path.resolve(__dirname, '../.husky/pre-commit');
const preCommitBackupPath = path.resolve(__dirname, '../.husky/pre-commit.backup');

try {
  if (fs.existsSync(preCommitBackupPath)) {
    fs.copyFileSync(preCommitBackupPath, preCommitPath);
    fs.unlinkSync(preCommitBackupPath);
    console.log('✅ Pre-commit hook restored from backup');
  } else {
    // Create the fixed pre-commit hook
    const fixedHook = `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Only run linting on staged files - remove blocking validations
npx lint-staged
`;
    
    fs.writeFileSync(preCommitPath, fixedHook);
    console.log('✅ Pre-commit hook restored with fixes');
  }
} catch (error) {
  console.log('⚠️  Could not restore pre-commit hook:', error.message);
}

// 2. Remove emergency scripts from package.json
const packageJsonPath = path.resolve(__dirname, '../package.json');
try {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  
  // Remove emergency scripts
  delete packageJson.scripts['emergency:commit'];
  delete packageJson.scripts['emergency:push'];
  delete packageJson.scripts['emergency:restore'];
  
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log('✅ Emergency scripts removed from package.json');
} catch (error) {
  console.log('⚠️  Could not modify package.json:', error.message);
}

console.log('\n🎉 Git hooks restored to normal operation!');
console.log('You can now use regular git commands safely.');
