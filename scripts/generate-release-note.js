// File: scripts/generate-release-note.js
/**
 * Version: 1.2.0
 * Description: Injects release metadata into markdown template
 * Author: Ali Kahwaji
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const [,, version, previousTag] = process.argv;

if (!version || !previousTag) {
  console.error('Usage: node scripts/generate-release-note.js <version> <previousTag>');
  process.exit(1);
}

const templatePath = path.join(__dirname, '../.github/release-template.md');
const outputPath = path.join(__dirname, `../docs-site/blog/${new Date().toISOString().split('T')[0]}-release-${version}.md`);

const template = fs.readFileSync(templatePath, 'utf-8');

// Count contributors
const contributors = execSync(`git shortlog -sne ${previousTag}..HEAD | wc -l`).toString().trim();
// Count commits
const commits = execSync(`git rev-list --count ${previousTag}..HEAD`).toString().trim();
// ISO date
const date = new Date().toISOString().split('T')[0];

// Inject into template
const filled = template
  .replace(/{{VERSION}}/g, version)
  .replace(/{{PREVIOUS_TAG}}/g, previousTag)
  .replace(/{{DATE}}/g, date)
  .replace(/{{CONTRIBUTORS}}/g, contributors)
  .replace(/{{COMMITS}}/g, commits);

fs.writeFileSync(outputPath, filled);
console.log(`✅ Generated release blog: ${outputPath}`);
