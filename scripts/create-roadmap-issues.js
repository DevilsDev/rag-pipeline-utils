/**
 * Version: 1.4.0
 * Path: scripts/create-roadmap-issues.js
 * Description: Parses roadmap markdown, creates GitHub Issues, links labels, and closes Done items
 * Author: Ali Kahwaji
 */

const fs = require('fs');
const path = require('path');
const { Octokit } = require('octokit');
const yaml = require('js-yaml');
const { ensureRoadmapLabels } = require('./ensure-roadmap-labels');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY || 'DevilsDev/rag-pipeline-utils';
const [owner, repo] = REPO.split('/');

const octokit = new Octokit({ auth: GITHUB_TOKEN });

async function createIssuesFromRoadmap() {
  const filePath = path.join('.github', 'PROJECT_ROADMAP.md');
  const contents = fs.readFileSync(filePath, 'utf-8');

  const blocks = contents.split(/^---$/gm).filter(Boolean).map((s) => s.trim());
  const frontmatters = blocks.map((block) => yaml.load(block));

  for (const meta of frontmatters) {
    if (!meta || !meta.title) continue;

    const labels = [];
    if (meta.priority) labels.push(`priority: ${meta.priority.toLowerCase()}`);
    if (meta.group) labels.push(`group: ${meta.group}`);

    const existing = await octokit.rest.issues.listForRepo({ owner, repo, state: 'open' });
    const found = existing.data.find((issue) => issue.title === meta.title);

    if (meta.status === '\u2705 Done' && found) {
      await octokit.rest.issues.update({ owner, repo, issue_number: found.number, state: 'closed' });
      console.log(`Closed Done issue: ${meta.title}`);
      continue;
    }

    if (!found) {
      await octokit.rest.issues.create({
        owner,
        repo,
        title: meta.title,
        body: meta.description || '_No details provided._',
        labels,
        milestone: meta.milestone || undefined
      });
      console.log(`Created new roadmap issue: ${meta.title}`);
    } else {
      await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: found.number,
        labels
      });
      console.log(`Updated existing issue: ${meta.title}`);
    }
  }
}

async function main() {
  try {
    await ensureRoadmapLabels({ token: GITHUB_TOKEN, owner, repo });
    await createIssuesFromRoadmap();
  } catch (err) {
    console.error('Sync failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
