// scripts/generate-release-note.js
/**
 * Version: 2.2.0
 * Description: Generate release blog + changelog section and auto-push to Git
 * Author: Ali Kahwaji
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const [, , versionArg] = process.argv;

if (!versionArg) {
  console.error('❌ Usage: node scripts/generate-release-note.js <version>');
  process.exit(1);
}

const currentVersion = versionArg.startsWith('v') ? versionArg : `v${versionArg}`;
const dryRun = process.env.DRY_RUN === 'true'; // Optional toggle via env

function getPreviousTag() {
  try {
    return execSync('git describe --abbrev=0 --tags HEAD^', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

const previousTag = getPreviousTag();
if (!previousTag) {
  console.error('❌ Could not determine previous version tag');
  process.exit(1);
}

// Safely fallback to HEAD if the current tag doesn’t exist yet
function getCommits(from, to = 'HEAD') {
  const range = `${from}..${to}`;
  try {
    return execSync(`git log ${range} --pretty=format:"- %s"`, { encoding: 'utf-8' });
  } catch (err) {
    console.error(`❌ Failed to collect commits for range ${range}`);
    console.error(err.message);
    process.exit(1);
  }
}

function generateChangelog(commits) {
  return `## ${currentVersion}\n\n${commits}\n\n---\n`;
}

function generateBlogPost(version, commits) {
  const date = new Date().toISOString().slice(0, 10);
  const slug = `release-${version}`;
  return `---
slug: ${slug}
title: "🚀 Version ${version} Released"
authors: [ali]
tags: [release, changelog]
---

RAG Pipeline Utils **${version}** is now available on NPM!

## 🔧 Changes

${commits}

## 🔗 Resources

- GitHub Compare: [${previousTag}...${version}](https://github.com/DevilsDev/rag-pipeline-utils/compare/${previousTag}...${version})
- View full [CHANGELOG.md](../../CHANGELOG.md)
`;
}

const commits = getCommits(previousTag, currentVersion);
const blogContent = generateBlogPost(currentVersion, commits);
const changelogSection = generateChangelog(commits);

// Paths
const blogDate = new Date().toISOString().slice(0, 10);
const blogPath = path.join(__dirname, `../docs-site/blog/${blogDate}-${currentVersion}.md`);
const changelogPath = path.join(__dirname, '../CHANGELOG.md');

// Write output
fs.writeFileSync(blogPath, blogContent, 'utf-8');
fs.appendFileSync(changelogPath, `\n${changelogSection}`, 'utf-8');

// Optionally push to Git
if (!dryRun) {
  try {
    execSync('git add CHANGELOG.md docs-site/blog/*.md');
    execSync(`git commit -m "docs(release): publish changelog and blog for ${currentVersion}"`);
    execSync(`git tag ${currentVersion}`);
    execSync('git push origin main --follow-tags');
    console.log(`✅ Release ${currentVersion} committed + tagged + pushed.`);
  } catch (err) {
    console.error('❌ Git push failed:', err.message);
    process.exit(1);
  }
} else {
  console.log('\n📝 [DRY RUN] Blog Markdown:\n', blogContent);
  console.log('\n📘 [DRY RUN] Changelog:\n', changelogSection);
  console.log('\n🚫 Skipping Git operations in dry-run mode.\n');
}
