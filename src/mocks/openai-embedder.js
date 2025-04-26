// /scripts/create-roadmap-issues.js
/**
 * Version: 1.2.0
 * Description: Creates or updates GitHub Issues based on PROJECT_ROADMAP.md
 * Author: Ali Kahwaji
 */

import fs from 'fs';
import { Octokit } from 'octokit';
import yaml from 'js-yaml';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER = 'DevilsDev';
const REPO = 'rag-pipeline-utils';
const ROADMAP_PATH = '.github/PROJECT_ROADMAP.md';

const octokit = new Octokit({ auth: GITHUB_TOKEN });

async function createRoadmapIssues() {
  const content = fs.readFileSync(ROADMAP_PATH, 'utf-8');
  const lines = content.split('\n').filter(line => line.startsWith('|'));
  const rows = lines.slice(2);

  for (const row of rows) {
    const [phase, priority, group, title, description, status] = row.split('|').map(col => col.trim());

    if (!title || title === '-') continue;

    const { data: issues } = await octokit.rest.issues.listForRepo({ owner: OWNER, repo: REPO, state: 'open' });
    const existing = issues.find((issue) => issue.title === title);

    if (!existing) {
      await octokit.rest.issues.create({
        owner: OWNER,
        repo: REPO,
        title,
        body: `**Phase**: ${phase}\n**Priority**: ${priority}\n**Group**: ${group}\n\n${description}`,
        labels: [`phase:${phase}`, `priority:${priority}`, `group:${group}`]
      });
      console.log(`✅ Created issue: ${title}`);
    }
  }
}

createRoadmapIssues().catch(err => {
  console.error('❌ Roadmap issue sync failed:', err.message);
  process.exit(1);
});
