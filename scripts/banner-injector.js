/**
 * Version: 1.0.0
 * Description: Syncs roadmap items from a structured Markdown file into GitHub Issues with labels and assignees.
 * Author: Ali Kahwaji
 */

import fs from 'fs';
import path from 'path';
import { Octokit } from 'octokit';
import dotenv from 'dotenv';

dotenv.config();

/**
 * GitHub Personal Access Token required via .env or CI secrets
 * Ensure the token has 'repo' scope for private issue creation.
 */
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // e.g. DevilsDev/rag-pipeline-utils
const ROADMAP_PATH = path.resolve('.github/PROJECT_ROADMAP.md');

if (!GITHUB_TOKEN || !GITHUB_REPO) {
  console.error('❌ GITHUB_TOKEN and GITHUB_REPO must be defined in environment.');
  process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });

/**
 * Parse roadmap Markdown file into structured issue definitions
 */
function parseRoadmapMarkdown(markdown) {
  const lines = markdown.split('\n');
  const issues = [];

  for (const line of lines) {
    if (line.startsWith('|')) {
      const cells = line.split('|').map(c => c.trim());

      if (cells.length < 6 || cells[0] === 'Phase') continue;

      const [, phase, priority, feature, group, tags] = cells;

      issues.push({
        title: `${phase.trim()}: ${feature.trim()}`,
        body: `**Feature Group:** ${group}\n**Priority:** ${priority}`,
        labels: [phase, priority, ...tags.split(',').map(tag => tag.trim())].filter(Boolean),
      });
    }
  }

  return issues;
}

/**
 * Create an issue in GitHub if it doesn't already exist
 */
async function createOrUpdateIssues(issues) {
  const [owner, repo] = GITHUB_REPO.split('/');

  const { data: existingIssues } = await octokit.rest.issues.listForRepo({
    owner,
    repo,
    state: 'all',
    per_page: 100,
  });

  for (const issue of issues) {
    const exists = existingIssues.find(i => i.title === issue.title);
    if (exists) {
      console.log(`✅ Skipped (exists): ${issue.title}`);
      continue;
    }

    await octokit.rest.issues.create({
      owner,
      repo,
      title: issue.title,
      body: issue.body,
      labels: issue.labels,
    });

    console.log(`➕ Created: ${issue.title}`);
  }
}

/**
 * Entrypoint
 */
async function main() {
  try {
    const roadmap = fs.readFileSync(ROADMAP_PATH, 'utf-8');
    const issues = parseRoadmapMarkdown(roadmap);
    await createOrUpdateIssues(issues);
    console.log(`🎯 Synced ${issues.length} roadmap issues.`);
  } catch (err) {
    console.error('🚨 Roadmap sync failed:', err.message);
    process.exit(1);
  }
}

main();
