/**
const fs = require('fs');
 * Version: 1.1.0
 * Description: Closes GitHub issues marked as ✅ Done in the PROJECT_ROADMAP.md
 * Author: Ali Kahwaji
 */

import fs from 'fs';
import { Octokit } from 'octokit';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER = 'DevilsDev';
const REPO = 'rag-pipeline-utils';
const ROADMAP_PATH = '.github/PROJECT_ROADMAP.md';

const octokit = new Octokit({ auth: GITHUB_TOKEN });

async function closeDoneIssues() {
  const content = fs.readFileSync(ROADMAP_PATH, 'utf-8');
  const lines = content.split('\n').filter(line => line.startsWith('|'));
  if (lines.length < 3) {
    console.log('⚠️ No roadmap rows found to evaluate.'); // eslint-disable-line no-console
    return;
  }

  const rows = lines.slice(2); // Skip header and separator

  const { data: issues } = await octokit.rest.issues.listForRepo({
    owner: OWNER,
    repo: REPO,
    state: 'open',
    per_page: 100
  });

  for (const row of rows) {
    const cols = row.split('|').map(col => col.trim());
    const [, , , title, , status] = cols;

    const safeStatus = status?.toLowerCase?.();
    if (!safeStatus || !safeStatus.includes('✅')) continue;

    const match = issues.find(issue => issue.title.trim() === title.trim());
    if (!match) continue;

    await octokit.rest.issues.createComment({
      owner: OWNER,
      repo: REPO,
      issue_number: match.number,
      body: '✅ Automatically closed from roadmap sync.'
    });

    await octokit.rest.issues.update({
      owner: OWNER,
      repo: REPO,
      issue_number: match.number,
      state: 'closed'
    });

    console.log(`🔒 Closed: #${match.number} "${title}"`); // eslint-disable-line no-console
  }
}

closeDoneIssues().catch(error => {
  console.error('❌ Error closing roadmap issues:', error); // eslint-disable-line no-console
  process.exit(1);
});
