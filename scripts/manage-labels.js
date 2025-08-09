#!/usr/bin/env node

/**
const fs = require('fs');
const path = require('path');
 * GitHub Label Management Script
 * Version: 2.0.0
 * Description: Consolidated script for creating, updating, and syncing GitHub repository labels
 * Author: Ali Kahwaji
 * 
 * Consolidates functionality from:
 * - ensure-roadmap-labels.js
 * - sync-labels.js
 * - sync-roadmap-labels.js
 */

import fs from 'fs';
import path from 'path';
import { Octokit } from 'octokit';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { setupCLI, dryRunWrapper } from './utils/cli.js';
import { withRateLimit } from './utils/retry.js';

dotenv._config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load configuration
const configPath = path.resolve(__dirname, 'scripts._config.json');
const _config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Setup CLI
const { args, logger } = setupCLI('manage-labels.js', 'Manage GitHub repository labels', {
  '--action': 'Action to perform: create, update, sync, or ensure (default: ensure)',
  '--owner': 'GitHub repository owner (default: from _config)',
  '--repo': 'GitHub repository name (default: from _config)',
  '--labels-file': 'Path to labels JSON file (default: use _config)',
  '--roadmap-only': 'Only manage roadmap-related labels'
});

// Environment validation
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || `${_config.github.owner}/${_config.github.repo}`;

if (!GITHUB_TOKEN) {
  logger.error('GITHUB_TOKEN environment variable is required');
  process.exit(1);
}

const [owner, repo] = (args.repo && args.owner) 
  ? [args.owner, args.repo]
  : GITHUB_REPO.split('/');

if (!owner || !repo) {
  logger.error('GitHub owner and repo must be specified via --owner/--repo or GITHUB_REPO env var');
  process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });
const action = args.action || 'ensure';

/**
 * Get label definitions from configuration or file
 * @returns {Object} - Label definitions
 */
function getLabelDefinitions() {
  if (args.labelsFile) {
    const labelsPath = path.resolve(args.labelsFile);
    if (!fs.existsSync(labelsPath)) {
      logger.error(`Labels file not found: ${labelsPath}`);
      process.exit(1);
    }
    return JSON.parse(fs.readFileSync(labelsPath, 'utf-8'));
  }

  // Use roadmap labels from config
  if (args.roadmapOnly) {
    return _config.roadmap.issueLabels;
  }

  // Extended label set for full repository
  return {
    ..._config.roadmap.issueLabels,
    // Additional standard labels
    'good first issue': {
      name: 'good first issue',
      color: '7057ff',
      description: 'Good for newcomers'
    },
    'help wanted': {
      name: 'help wanted',
      color: '008672',
      description: 'Extra attention is needed'
    },
    'priority: high': {
      name: 'priority: high',
      color: 'd93f0b',
      description: 'High priority issue'
    },
    'priority: medium': {
      name: 'priority: medium',
      color: 'fbca04',
      description: 'Medium priority issue'
    },
    'priority: low': {
      name: 'priority: low',
      color: '0e8a16',
      description: 'Low priority issue'
    },
    '_type: feature': {
      name: '_type: feature',
      color: 'a2eeef',
      description: 'New feature or request'
    },
    '_type: bug': {
      name: '_type: bug',
      color: 'd73a49',
      description: 'Something isn\'t working'
    },
    '_type: maintenance': {
      name: '_type: maintenance',
      color: 'fef2c0',
      description: 'Maintenance and housekeeping'
    }
  };
}

/**
 * Fetch existing labels from repository
 * @returns {Array} - Existing labels
 */
async function fetchExistingLabels() {
  return await withRateLimit(octokit, async () => {
    logger.progress('Fetching existing labels...');
    
    const { data: labels } = await octokit.rest.issues.listLabelsForRepo({
      owner,
      repo,
      per_page: 100
    });

    logger.debug(`Found ${labels.length} existing labels`);
    return labels;
  }, 'fetch existing labels');
}

/**
 * Create a new label
 * @param {Object} labelDef - Label definition
 */
async function createLabel(labelDef) {
  return await withRateLimit(octokit, async () => {
    await dryRunWrapper(
      args.dryRun,
      `Create label: ${labelDef.name} (${labelDef.color})`,
      async () => {
        await octokit.rest.issues.createLabel({
          owner,
          repo,
          name: labelDef.name,
          color: labelDef.color.replace('#', ''),
          description: labelDef.description || ''
        });
      }
    );
  }, `create label: ${labelDef.name}`);
}

/**
 * Update an existing label
 * @param {string} currentName - Current label name
 * @param {Object} labelDef - New label definition
 */
async function updateLabel(_currentName, _labelDef) {
  return await withRateLimit(octokit, async () => {
    await dryRunWrapper(
      args.dryRun,
      `Update label: ${_currentName} → ${_labelDef.name} (${_labelDef.color})`,
      async () => {
        await octokit.rest.issues.updateLabel({
          owner,
          repo,
          name: _currentName,
          new_name: _labelDef.name,
          color: _labelDef.color.replace('#', ''),
          description: _labelDef.description || ''
        });
      }
    );
  }, `update label: ${_currentName}`);
}

/**
 * Delete a label
 * @param {string} labelName - Label name to delete
 */
async function _deleteLabel(labelName) {
  return await withRateLimit(octokit, async () => {
    await dryRunWrapper(
      args.dryRun,
      `Delete label: ${labelName}`,
      async () => {
        await octokit.rest.issues.deleteLabel({
          owner,
          repo,
          name: labelName
        });
      }
    );
  }, `delete label: ${labelName}`);
}

/**
 * Ensure labels exist (create if missing)
 * @param {Object} labelDefinitions - Label definitions
 * @param {Array} existingLabels - Existing labels
 */
async function ensureLabels(_labelDefinitions, _existingLabels) {
  const existingNames = new Set(_existingLabels.map(l => l.name.toLowerCase()));
  const toCreate = [];

  for (const [key, labelDef] of Object.entries(_labelDefinitions)) {
    if (!existingNames.has(labelDef.name.toLowerCase())) {
      toCreate.push(labelDef);
    }
  }

  logger.info(`Creating ${toCreate.length} missing labels`);

  for (const labelDef of toCreate) {
    await createLabel(labelDef);
  }

  return { created: toCreate.length };
}

/**
 * Sync labels (create missing, update existing)
 * @param {Object} labelDefinitions - Label definitions
 * @param {Array} existingLabels - Existing labels
 */
async function syncLabels(_labelDefinitions, _existingLabels) {
  const existingMap = new Map(_existingLabels.map(l => [l.name.toLowerCase(), l]));
  let created = 0;
  let updated = 0;

  for (const [key, labelDef] of Object.entries(_labelDefinitions)) {
    const existing = existingMap.get(labelDef.name.toLowerCase());

    if (!existing) {
      await createLabel(labelDef);
      created++;
    } else {
      // Check if update is needed
      const needsUpdate = 
        existing.color !== labelDef.color.replace('#', '') ||
        existing.description !== (labelDef.description || '');

      if (needsUpdate) {
        await updateLabel(existing.name, labelDef);
        updated++;
      } else {
        logger.debug(`Label up to date: ${labelDef.name}`);
      }
    }
  }

  return { created, updated };
}

/**
 * Main execution function
 */
async function main() {
  try {
    logger.info(`Managing labels for: ${owner}/${repo}`);
    logger.info(`Action: ${action}`);

    const labelDefinitions = getLabelDefinitions();
    const labelCount = Object.keys(labelDefinitions).length;
    logger.info(`Managing ${labelCount} label definitions`);

    const existingLabels = await fetchExistingLabels();

    let result;
    switch (action) {
      case 'create':
        // Only create missing labels
        result = await ensureLabels(labelDefinitions, existingLabels);
        logger.success(`✅ Created ${result.created} labels`);
        break;

      case 'sync':
      case 'update':
        // Create missing and update existing
        result = await syncLabels(labelDefinitions, existingLabels);
        logger.success(`✅ Created ${result.created} labels, updated ${result.updated} labels`);
        break;

      case 'ensure':
      default:
        // Only create missing (safe default)
        result = await ensureLabels(labelDefinitions, existingLabels);
        logger.success(`✅ Ensured ${result.created} labels exist`);
        break;
    }

    logger.success('🏷️ Label management completed!');

  } catch (error) {
    logger.error(`Label management failed: ${error.message}`);
    if (args.verbose) {
      logger.error(error.stack);
    }
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
