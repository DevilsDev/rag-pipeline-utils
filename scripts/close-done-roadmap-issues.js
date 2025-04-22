/**
 * Version: 1.0.0
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
  const headers = lines[0].split('|').map(h => h.trim());
  const rows = lines.slice(2); // skip header and separator

  for (const row of rows) {
    const cols = row.split('|').map(col => col.trim());
    const [phase, priority, group, title, description, status] = cols;

    if (status.toLowerCase().includes('✅')) {
      const { data: issues } = await octokit.rest.issues.listForRepo({
        owner: OWNER,
        repo: REPO,
        state: 'open',
        per_page: 100
      });

      const match = issues.find(issue => issue.title === title);

      if (match) {
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

        console.log(`🔒 Closed: #${match.number} "${title}"`);
      }
    }
  }
}

closeDoneIssues().catch(error => {
  console.error('❌ Error closing roadmap issues:', error);
  process.exit(1);
});
