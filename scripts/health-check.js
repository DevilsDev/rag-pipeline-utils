#!/usr/bin/env node

/**
const fs = require('fs');
const path = require('path');
 * Project Health Check Script
 * Version: 1.0.0
 * Description: Comprehensive health check for the RAG Pipeline Utils project
 * Author: Ali Kahwaji
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createLogger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const logger = createLogger('health-check');

/**
 * Check if a file or directory exists
 * @param {string} _filePath - Path to check
 * @returns {boolean} - Whether the path exists
 */
function exists(filePath) {
  return fs.existsSync(path.resolve(ROOT, filePath));
}

/**
 * Run a command and return success status
 * @param {string} command - Command to run
 * @returns {boolean} - Whether command succeeded
 */
function runCommand(command) {
  try {
    execSync(command, { cwd: ROOT, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check project structure
 */
function checkProjectStructure() {
  logger.info('🏗️ Checking project structure...');
  
  const requiredPaths = [
    'package.json',
    'README.md',
    'CHANGELOG.md',
    'src/',
    'scripts/',
    'scripts/utils/',
    'scripts/scripts._config.json',
    '__tests__/',
    'docs-site/',
    'public/',
    '.github/workflows/'
  ];
  
  let passed = 0;
  
  for (const pathToCheck of requiredPaths) {
    if (exists(pathToCheck)) {
      logger.success(`✅ ${pathToCheck}`);
      passed++;
    } else {
      logger.error(`❌ Missing: ${pathToCheck}`);
    }
  }
  
  return passed === requiredPaths.length;
}

/**
 * Check refactored scripts
 */
function checkRefactoredScripts() {
  logger.info('📜 Checking refactored scripts...');
  
  const requiredScripts = [
    'scripts/roadmap-sync.js',
    'scripts/manage-labels.js',
    'scripts/generate-release-note.js',
    'scripts/ci-runner.js',
    'scripts/restore-git-hooks.js',
    'scripts/utils/logger.js',
    'scripts/utils/retry.js',
    'scripts/utils/cli.js'
  ];
  
  let passed = 0;
  
  for (const script of requiredScripts) {
    if (exists(script)) {
      logger.success(`✅ ${script}`);
      passed++;
    } else {
      logger.error(`❌ Missing: ${script}`);
    }
  }
  
  // Check that old scripts are removed
  const removedScripts = [
    'scripts/banner-injector.js',
    'scripts/ensure-roadmap-labels.js',
    'scripts/sync-labels.js',
    'scripts/sync-roadmap-labels.js'
  ];
  
  for (const script of removedScripts) {
    if (!exists(script)) {
      logger.success(`✅ Removed: ${script}`);
      passed++;
    } else {
      logger.warn(`⚠️ Should be removed: ${script}`);
    }
  }
  
  return passed >= requiredScripts.length;
}

/**
 * Check documentation
 */
function checkDocumentation() {
  logger.info('📚 Checking documentation...');
  
  const requiredDocs = [
    'docs-site/docs/Overview.md',
    'docs-site/docs/Architecture.md',
    'docs-site/docs/Usage.md',
    'docs-site/docs/CLI.md',
    'docs-site/docs/Plugins.md',
    'docs-site/docs/Evaluation.md',
    'docs-site/docs/Troubleshooting.md',
    'docs-site/docs/Migration.md',
    'docs-site/docs/Performance.md',
    'docs-site/docs/Security.md',
    'scripts/SCRIPT_MIGRATION.md'
  ];
  
  let passed = 0;
  
  for (const doc of requiredDocs) {
    if (exists(doc)) {
      const content = fs.readFileSync(path.resolve(ROOT, doc), 'utf-8');
      if (content.length > 1000) { // Check for substantial content
        logger.success(`✅ ${doc} (${content.length} bytes)`);
        passed++;
      } else {
        logger.warn(`⚠️ ${doc} (too short: ${content.length} bytes)`);
      }
    } else {
      logger.error(`❌ Missing: ${doc}`);
    }
  }
  
  return passed >= requiredDocs.length * 0.9; // 90% threshold
}

/**
 * Check dashboard deployment
 */
function checkDashboard() {
  logger.info('📊 Checking evaluation dashboard...');
  
  const dashboardFiles = [
    'public/index.html',
    'public/package.json',
    'public/src/App.jsx',
    'public/src/components/ScoreTable.jsx',
    'public/src/components/ScoreChart.jsx',
    'public/src/components/Filters.jsx',
    'public/vite._config.js',
    'public/tailwind._config.js'
  ];
  
  let passed = 0;
  
  for (const file of dashboardFiles) {
    if (exists(file)) {
      logger.success(`✅ ${file}`);
      passed++;
    } else {
      logger.error(`❌ Missing: ${file}`);
    }
  }
  
  return passed >= dashboardFiles.length * 0.8; // 80% threshold
}

/**
 * Check package health
 */
function checkPackageHealth() {
  logger.info('📦 Checking package health...');
  
  const checks = [
    { name: 'npm install', command: 'npm list --depth=0' },
    { name: 'ESLint', command: 'npm run lint' },
    { name: 'Tests', command: 'npm test' }
  ];
  
  let passed = 0;
  
  for (const check of checks) {
    if (runCommand(check.command)) {
      logger.success(`✅ ${check.name}`);
      passed++;
    } else {
      logger.warn(`⚠️ ${check.name} (may need attention)`);
    }
  }
  
  return passed >= 2; // At least 2 out of 3 should pass
}

/**
 * Generate health report
 */
function generateHealthReport(results) {
  const totalChecks = Object.keys(results).length;
  const passedChecks = Object.values(results).filter(Boolean).length;
  const healthScore = Math.round((passedChecks / totalChecks) * 100);
  
  logger.info('\n📋 Health Check Report');
  logger.info('======================');
  
  for (const [check, passed] of Object.entries(results)) {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    logger.info(`${status} ${check}`);
  }
  
  logger.info(`\n🎯 Overall Health Score: ${healthScore}%`);
  
  if (healthScore >= 90) {
    logger.success('🎉 Excellent! Project is in excellent health.');
    logger.success('✅ Ready for production deployment and enterprise use.');
  } else if (healthScore >= 80) {
    logger.warn('⚠️ Good health with minor issues.');
    logger.warn('Most components are working well, some attention needed.');
  } else if (healthScore >= 70) {
    logger.warn('⚠️ Moderate health issues detected.');
    logger.warn('Several components need attention before production use.');
  } else {
    logger.error('❌ Poor health - significant issues detected.');
    logger.error('Major components need fixing before deployment.');
  }
  
  return healthScore;
}

/**
 * Main health check execution
 */
async function main() {
  logger.info('🏥 RAG Pipeline Utils - Project Health Check');
  logger.info('============================================');
  
  const results = {
    'Project Structure': checkProjectStructure(),
    'Refactored Scripts': checkRefactoredScripts(),
    'Documentation': checkDocumentation(),
    'Dashboard': checkDashboard(),
    'Package Health': checkPackageHealth()
  };
  
  const healthScore = generateHealthReport(results);
  
  logger.info('\n💡 Recommendations:');
  
  if (healthScore >= 90) {
    logger.info('• Consider adding automated health monitoring');
    logger.info('• Set up regular dependency updates');
    logger.info('• Monitor performance metrics in production');
  } else {
    logger.info('• Address any failing health checks above');
    logger.info('• Run individual component tests for detailed diagnostics');
    logger.info('• Review logs for specific error messages');
  }
  
  logger.success('\n🚀 Health check completed!');
  
  return healthScore >= 80 ? 0 : 1;
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(exitCode => {
    process.exit(exitCode);
  }).catch(error => {
    logger.error(`Health check failed: ${error.message}`);
    process.exit(1);
  });
}
