// scripts/create-roadmap-issues.js

/**
 * Version: 2.0.0
 * Description: Parses PROJECT_ROADMAP.md and syncs GitHub issues
 * Author: Ali Kahwaji
 */

import fs from 'fs/promises';
import path from 'path';
import { Octokit } from 'octokit';
import yaml from 'js-yaml';

const roadmapPath = new URL('../.github/PROJECT_ROADMAP.md', import.meta.url);

export async function createRoadmapIssues({ token, owner, repo }) {
  const octokit = new Octokit({ auth: token });
  const content = await fs.readFile(roadmapPath, 'utf-8');

  const blocks = content.split(/^##\s+/gm).slice(1);

  for (const block of blocks) {
    const [header, ...bodyLines] = block.trim().split('\n');
    const title = header.trim();
    const metadata = {};
    const description = [];

    for (const line of bodyLines) {
      if (line.includes(':') && line.includes('**')) {
        const [key, val] = line.split(':');
        metadata[key.trim()] = val.replace(/\*\*/g, '').trim();
      } else {
        description.push(line);
      }
    }

    const issue = await octokit.rest.issues.create({
      owner,
      repo,
      title,
      body: description.join('\n'),
      labels: [metadata.Priority, metadata.Group].filter(Boolean),
    });

    console.log(`✅ Created: ${issue.data.title}`);
  }
}
