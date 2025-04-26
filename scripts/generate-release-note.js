/**
 * Version: 2.7.0
 * Description: Generates changelog section and blog markdown from a GitHub tag
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
  console.error('❌ Usage: node scripts/generate-release-note.js <new-tag>');
  process.exit(1);
}

const newVersion = versionArg.startsWith('v') ? versionArg : `v${versionArg}`;

/**
 * Resolves previous Git tag for comparison.
 * @returns {string|null}
 */
function resolvePreviousTag() {
  try {
    const tags = execSync('git tag --sort=-creatordate', { encoding: 'utf-8' })
      .split('\n')
      .filter(Boolean);
    const idx = tags.indexOf(newVersion);
    return tags[idx + 1] || tags[1] || null;
  } catch {
    return null;
  }
}

const prevVersion = resolvePreviousTag();
if (!prevVersion) {
  console.error('❌ Could not resolve previous tag.');
  process.exit(1);
}

/**
 * Get commit messages between two tags.
 * @param {string} from 
 * @param {string} to 
 * @returns {string}
 */
function getCommits(from, to) {
  try {
    return execSync(`git log ${from}..${to} --pretty=format:"- %s"`, { encoding: 'utf-8' });
  } catch (err) {
    console.error('❌ Failed to get commits:', err.message);
    process.exit(1);
  }
}

/**
 * Generate blog post markdown.
 * @param {string} version 
 * @param {string} commits 
 * @returns {string}
 */
function generateBlogMarkdown(version, commits) {
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

- GitHub Compare: [${prevVersion}...${version}](https://github.com/DevilsDev/rag-pipeline-utils/compare/${prevVersion}...${version})
- View full [CHANGELOG.md](../../CHANGELOG.md)
`;
}

/**
 * Generate changelog section markdown.
 * @param {string} commits 
 * @returns {string}
 */
function generateChangelogSection(commits) {
  return `## ${newVersion}\n\n${commits}\n\n---\n`;
}

// ---------------------------
// MAIN EXECUTION
// ---------------------------
const commits = getCommits(prevVersion, newVersion);
const blogContent = generateBlogMarkdown(newVersion, commits);
const changelogSection = generateChangelogSection(commits);

const blogPath = path.join(__dirname, `../docs-site/blog/${new Date().toISOString().slice(0, 10)}-${newVersion}.md`);
fs.writeFileSync(blogPath, blogContent, 'utf-8');

const changelogPath = path.join(__dirname, '../CHANGELOG.md');
fs.appendFileSync(changelogPath, `\n${changelogSection}`, 'utf-8');

// Auto Git commit unless dry-run
const dryRun = process.env.DRY_RUN === 'true';

if (!dryRun) {
  try {
    execSync('git config user.name "github-actions[bot]"');
    execSync('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"');
    execSync('git add CHANGELOG.md docs-site/blog/*.md');
    execSync(`git commit -m "docs(release): blog + changelog for ${newVersion}"`);
    execSync('git push origin main');
    console.log(`✅ Blog and changelog committed for ${newVersion}`);
  } catch (err) {
    console.warn('⚠️ Git push skipped:', err.message);
  }
} else {
  console.log('🚀 Dry-run mode active. No git push performed.');
}

// Print previews
console.log('\n📓 Blog Content Preview:\n');
console.log(blogContent);

console.log('\n📘 Changelog Section Preview:\n');
console.log(changelogSection);
