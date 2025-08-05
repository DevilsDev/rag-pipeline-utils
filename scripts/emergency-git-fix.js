#!/usr/bin/env node

/**
 * Emergency Git Recovery Script
 * Temporarily disables blocking hooks and validations to restore Git operations
 * Run this if you're unable to commit or push due to CI/hook issues
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚨 Emergency Git Recovery Mode');
console.log('This script will temporarily disable blocking Git hooks and validations.\n');

// 1. Backup and disable pre-commit hook
const preCommitPath = path.resolve(__dirname, '../.husky/pre-commit');
const preCommitBackupPath = path.resolve(__dirname, '../.husky/pre-commit.backup');

try {
  if (fs.existsSync(preCommitPath)) {
    // Create backup
    fs.copyFileSync(preCommitPath, preCommitBackupPath);
    
    // Create minimal pre-commit hook
    const minimalHook = `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Emergency mode: minimal validation only
echo "⚠️  Running in emergency Git recovery mode"
echo "Pre-commit validations temporarily disabled"
`;
    
    fs.writeFileSync(preCommitPath, minimalHook);
    console.log('✅ Pre-commit hook backed up and minimized');
  }
} catch (error) {
  console.log('⚠️  Could not modify pre-commit hook:', error.message);
}

// 2. Create emergency package.json scripts
const packageJsonPath = path.resolve(__dirname, '../package.json');
try {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  
  // Add emergency scripts
  packageJson.scripts['emergency:commit'] = 'git commit --no-verify';
  packageJson.scripts['emergency:push'] = 'git push --no-verify';
  packageJson.scripts['emergency:restore'] = 'node scripts/restore-git-hooks.js';
  
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log('✅ Emergency Git scripts added to package.json');
} catch (error) {
  console.log('⚠️  Could not modify package.json:', error.message);
}

console.log('\n🎯 Emergency Recovery Complete!');
console.log('\nYou can now use these commands:');
console.log('  npm run emergency:commit   # Commit without pre-commit hooks');
console.log('  npm run emergency:push     # Push without pre-push hooks');
console.log('  git commit --no-verify     # Direct Git commit bypass');
console.log('  git push --no-verify       # Direct Git push bypass');
console.log('\n🔄 To restore normal Git hooks later:');
console.log('  npm run emergency:restore');
console.log('\n⚠️  Remember: This bypasses all validations. Use responsibly!');
