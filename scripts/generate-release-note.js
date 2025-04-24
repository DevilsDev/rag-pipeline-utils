// scripts/generate-release-note.js
/**
 * Version: 2.3.0
 * Description: Generate release blog + changelog section, auto-push to Git, fallback to safe defaults
 * Author: Ali Kahwaji
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const [, , newVersionArg, previousVersionArg] = process.argv;

if (!newVersionArg) {
  console.error('❌ Usage: node scripts/generate-release-note.js <new-tag> <previous-tag?>');
  process.exit(1);
}

const newVersion = newVersionArg.startsWith('v') ? newVersionArg : `v${newVersionArg}`;

// 🔁 Fallback to previous git tag
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

const prevVersion = previousVersionArg || resolvePreviousTag();
if (!prevVersion) {
  console.error('❌ Could not resolve previous tag.');
  process.exit(1);
}

// 📦 Get commits between versions
function getCommits(from, to) {
  try {
    return execSync(`git log ${from}..${to} --pretty=format:"- %s"`, { encoding: 'utf-8' });
  } catch (err) {
    console.error('❌ Failed to fetch commits:', err.message);
    process.exit(1);
  }
}

function generateChangelogSection(commits) {
  return `## ${newVersion}\n\n${commits}\n\n---\n`;
}

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

const commits = getCommits(prevVersion, newVersion);
const blogContent = generateBlogMarkdown(newVersion, commits);
const changelogSection = generateChangelogSection(commits);

// 📍 Paths
const today = new Date().toISOString().slice(0, 10);
const blogPath = path.join(__dirname, `../docs-site/blog/${today}-${newVersion}.md`);
const changelogPath = path.join(__dirname, '../CHANGELOG.md');

// 📝 Write blog + changelog
fs.writeFileSync(blogPath, blogContent, 'utf-8');
fs.appendFileSync(changelogPath, `\n${changelogSection}`, 'utf-8');

// 🔐 Commit and push
try {
  execSync('git config user.name "github-actions[bot]"');
  execSync('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"');
  execSync('git add CHANGELOG.md docs-site/blog/*.md');
  execSync(`git commit -m "docs(release): publish changelog and blog for ${newVersion}"`);
  execSync('git push origin main');
  console.log(`✅ Blog + changelog committed for ${newVersion}`);
} catch (err) {
  console.warn('⚠️ Git commit skipped (already committed or no changes).');
}

// 📦 Local preview
console.log('\n📘 Blog Preview:\n');
console.log(blogContent);
console.log('\n📘 Changelog Section:\n');
console.log(changelogSection);
