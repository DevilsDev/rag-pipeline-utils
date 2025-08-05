#!/usr/bin/env node

/**
 * Roadmap Sync Script
 * Version: 2.0.0
 * Description: Syncs roadmap items from PROJECT_ROADMAP.md to GitHub Issues with labels and assignees
 * Author: Ali Kahwaji
 */

import fs from 'fs';
import path from 'path';
import { Octokit } from 'octokit';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { setupCLI, dryRunWrapper, validateArgs } from './utils/cli.js';
import { withRateLimit } from './utils/retry.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load configuration
const configPath = path.resolve(__dirname, 'scripts.config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Setup CLI
const { args, logger } = setupCLI('roadmap-sync.js', 'Sync roadmap items to GitHub Issues', {
  '--roadmap-file': 'Path to roadmap markdown file (default: PROJECT_ROADMAP.md)',
  '--owner': 'GitHub repository owner (default: from config)',
  '--repo': 'GitHub repository name (default: from config)',
  '--create-labels': 'Create missing labels automatically'
});

// Environment validation
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || `${config.github.owner}/${config.github.repo}`;

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
const roadmapPath = args.roadmapFile || path.resolve(config.roadmap.filePath);

/**
 * Parse roadmap Markdown file into structured issue definitions
 * @param {string} markdown - Markdown content
 * @returns {Array} - Array of issue objects
 */
function parseRoadmapMarkdown(markdown) {
  const lines = markdown.split('\n');
  const issues = [];
  
  logger.debug(`Parsing roadmap with ${lines.length} lines`);

  for (const line of lines) {
    if (line.startsWith('|') && line.includes('|')) {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);

      // Skip header rows
      if (cells.length < 4 || cells[0] === 'Phase' || cells[0].includes('---')) {
        continue;
      }

      // Handle different roadmap formats
      let title, body, labels, assignee;
      
      if (cells.length >= 6) {
        // Format: | Phase | Priority | Feature | Group | Tags | Assignee |
        const [phase, priority, feature, group, tags, assigneeCell] = cells;
        title = `${phase}: ${feature}`;
        body = `**Feature Group:** ${group}\n**Priority:** ${priority}\n\n*Synced from PROJECT_ROADMAP.md*`;
        labels = [
          'roadmap',
          phase.toLowerCase().replace(/\s+/g, '-'),
          priority.toLowerCase().replace(/\s+/g, '-'),
          ...tags.split(',').map(tag => tag.trim().toLowerCase())
        ].filter(Boolean);
        assignee = assigneeCell && assigneeCell !== '-' ? assigneeCell.replace('@', '') : null;
      } else if (cells.length >= 4) {
        // Format: | Status | Feature | Priority | Assignee |
        const [status, feature, priority, assigneeCell] = cells;
        title = feature;
        body = `**Priority:** ${priority}\n**Status:** ${status}\n\n*Synced from PROJECT_ROADMAP.md*`;
        labels = ['roadmap', priority.toLowerCase().replace(/\s+/g, '-')];
        assignee = assigneeCell && assigneeCell !== '-' ? assigneeCell.replace('@', '') : null;
      }

      if (title && title.trim()) {
        issues.push({
          title: title.trim(),
          body: body.trim(),
          labels: [...new Set(labels)], // Remove duplicates
          assignee
        });
      }
    }
  }

  logger.info(`Parsed ${issues.length} roadmap items`);
  return issues;
}

/**
 * Ensure required labels exist in the repository
 * @param {Array} requiredLabels - Labels that need to exist
 */
async function ensureLabels(requiredLabels) {
  if (!args.createLabels && !config.roadmap.createLabels) {
    logger.debug('Label creation disabled, skipping label check');
    return;
  }

  return await withRateLimit(octokit, async () => {
    const { data: existingLabels } = await octokit.rest.issues.listLabelsForRepo({
      owner,
      repo,
      per_page: 100
    });

    const existingLabelNames = new Set(existingLabels.map(l => l.name.toLowerCase()));
    const labelsToCreate = requiredLabels.filter(label => 
      !existingLabelNames.has(label.toLowerCase())
    );

    for (const labelName of labelsToCreate) {
      const labelConfig = config.roadmap.issueLabels[labelName] || {
        name: labelName,
        color: '0052cc',
        description: `Auto-created label: ${labelName}`
      };

      await dryRunWrapper(
        args.dryRun,
        `Create label: ${labelName}`,
        async () => {
          await octokit.rest.issues.createLabel({
            owner,
            repo,
            name: labelConfig.name,
            color: labelConfig.color,
            description: labelConfig.description
          });
        }
      );
    }

    if (labelsToCreate.length > 0) {
      logger.success(`Ensured ${labelsToCreate.length} labels exist`);
    }
  }, 'ensure labels');
}

/**
 * Create or update GitHub issues from roadmap items
 * @param {Array} issues - Issue objects to create/update
 */
async function createOrUpdateIssues(issues) {
  return await withRateLimit(octokit, async () => {
    logger.progress('Fetching existing issues...');
    
    const { data: existingIssues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: 'all',
      labels: 'roadmap',
      per_page: 100
    });

    const existingTitles = new Set(existingIssues.map(i => i.title));
    let created = 0;
    let skipped = 0;

    for (const issue of issues) {
      if (existingTitles.has(issue.title)) {
        logger.debug(`Skipped (exists): ${issue.title}`);
        skipped++;
        continue;
      }

      await dryRunWrapper(
        args.dryRun,
        `Create issue: ${issue.title}`,
        async () => {
          const issueData = {
            owner,
            repo,
            title: issue.title,
            body: issue.body,
            labels: issue.labels
          };

          if (issue.assignee) {
            issueData.assignees = [issue.assignee];
          }

          await octokit.rest.issues.create(issueData);
          created++;
        }
      );
    }

    logger.success(`Created ${created} new issues, skipped ${skipped} existing`);
    return { created, skipped };
  }, 'create/update issues');
}

/**
 * Main execution function
 */
async function main() {
  try {
    logger.info(`Syncing roadmap from: ${roadmapPath}`);
    logger.info(`Target repository: ${owner}/${repo}`);

    // Validate roadmap file exists
    if (!fs.existsSync(roadmapPath)) {
      logger.error(`Roadmap file not found: ${roadmapPath}`);
      process.exit(1);
    }

    // Parse roadmap
    const roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');
    const issues = parseRoadmapMarkdown(roadmapContent);

    if (issues.length === 0) {
      logger.warn('No roadmap items found to sync');
      return;
    }

    // Collect all unique labels
    const allLabels = [...new Set(issues.flatMap(issue => issue.labels))];
    logger.debug(`Found labels: ${allLabels.join(', ')}`);

    // Ensure labels exist
    await ensureLabels(allLabels);

    // Create/update issues
    const result = await createOrUpdateIssues(issues);

    logger.success(`🎯 Roadmap sync completed! Created: ${result.created}, Skipped: ${result.skipped}`);

  } catch (error) {
    logger.error(`Roadmap sync failed: ${error.message}`);
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
