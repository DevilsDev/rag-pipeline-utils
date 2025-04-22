/**
 * Version: 2.1.0
 * Path: scripts/generate-release-note.js
 * Description: Generates GitHub-style markdown release notes between two tags
 * Author: Ali Kahwaji
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ----------- CI Git History Safeguard (shallow clones) -----------
try {
  execSync('git fetch --tags --unshallow', { stdio: 'inherit' });
} catch {
  execSync('git fetch --tags', { stdio: 'inherit' });
}

// ----------- Utility Functions -----------
function getCommits(fromTag, toTag) {
  const log = execSync(
    `git log ${fromTag}..${toTag} --pretty=format:"- %s"`,
    { encoding: 'utf-8' }
  );
  return log.trim();
}

function getCompareLink(fromTag, toTag) {
  return `https://github.com/DevilsDev/rag-pipeline-utils/compare/${fromTag}...${toTag}`;
}

function getAuthorStats(fromTag, toTag) {
  const output = execSync(
    `git shortlog -sne ${fromTag}..${toTag}`,
    { encoding: 'utf-8' }
  );
  const contributors = output.split('\n').filter(Boolean).length;
  const commits = execSync(
    `git rev-list --count ${fromTag}..${toTag}`,
    { encoding: 'utf-8' }
  );
  return { contributors, commits: commits.trim() };
}

function formatReleaseNote(version, fromTag, toTag, commits) {
  const compareUrl = getCompareLink(fromTag, toTag);
  const { contributors, commits: commitCount } = getAuthorStats(fromTag, toTag);
  const today = new Date().toISOString().split('T')[0];

  return `---
slug: release-${version}
title: "✨ Version ${version} Released"
authors: [ali]
tags: [release, changelog]
---

**Published:** \`${today}\`  
**Compare changes:** [View diff](${compareUrl})  
**Contributors:** \`${contributors}\`  
**Commits:** \`${commitCount}\`

---

## 📦 What's New

${commits || '- No commits detected.'}

---

## 📘 Changelog

See full details in [CHANGELOG.md](../../CHANGELOG.md)
`;
}

// ----------- Main Execution -----------
function main() {
  const [version, fromTag] = process.argv.slice(2);
  if (!version || !fromTag) {
    console.error('❌ Usage: node scripts/generate-release-note.js <newTag> <fromTag>');
    process.exit(1);
  }

  const toTag = `v${version}`;
  const commits = getCommits(fromTag, toTag);
  const markdown = formatReleaseNote(version, fromTag, toTag, commits);

  const file = path.join(__dirname, `../docs-site/blog/${new Date().toISOString().slice(0, 10)}-release-${version}.md`);
  fs.writeFileSync(file, markdown);
  console.log(`✅ Release note generated: ${file}`);
}

main();
