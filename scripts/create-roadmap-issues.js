/**
 * Script: create-roadmap-issues.js
 *  Version: 1.0.0
 * Description: Parses `.github/PROJECT_ROADMAP.md` and creates GitHub Issues per feature
 * Requirements: Set GH_TOKEN in env or .env file
 * Author: Ali Kahwaji
 */

import { Octokit } from 'octokit';
import fs from 'fs';
import dotenv from 'dotenv';
import readline from 'readline';

// Load .env if exists
dotenv.config();

const TOKEN = process.env.GH_TOKEN;
const REPO = 'rag-pipeline-utils';
const OWNER = 'DevilsDev';
const ROADMAP_PATH = '.github/PROJECT_ROADMAP.md';
const MILESTONE_CACHE = {}; // optional

const octokit = new Octokit({ auth: TOKEN });

function parseRoadmapMarkdown(markdown) {
  const lines = markdown.split('\n');
  const issues = [];

  for (const line of lines) {
    if (line.startsWith('| Phase')) continue;
    if (!line.startsWith('|')) continue;
    const parts = line.split('|').map((x) => x.trim());
    if (parts.length < 4) continue;
    const [_, phase, priority, feature] = parts;
    issues.push({ phase, priority, feature });
  }
  return issues;
}

async function createIssue({ phase, priority, feature }) {
  const title = `[${phase}] ${feature} (${priority} Priority)`;
  const labels = ['roadmap', `phase/${phase.split(' ')[1]}`, `priority/${priority.toLowerCase()}`];

  const res = await octokit.rest.issues.create({
    owner: OWNER,
    repo: REPO,
    title,
    labels,
    body: `Feature from roadmap\n\n**Phase**: ${phase}\n**Priority**: ${priority}\n\n> Auto-generated from PROJECT_ROADMAP.md`
  });

  console.log(`Created issue #${res.data.number}: ${res.data.title}`);
}

async function main() {
  const content = fs.readFileSync(ROADMAP_PATH, 'utf-8');
  const features = parseRoadmapMarkdown(content);
  for (const feature of features) {
    await createIssue(feature);
  }
}

main().catch(console.error);
