/**
 * Version: 2.0.0
 * Description: Tags release, updates changelog, optionally opens blog preview
 * Author: Ali Kahwaji
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import readline from 'readline';

const VERSION = process.argv[2];
const PREVIEW = process.argv.includes('--preview');

if (!VERSION) {
  console.error('❌ Usage: node release-tag.js <version> [--preview]');
  process.exit(1);
}

const tag = `v${VERSION}`;
const blogPath = path.join('docs-site', 'blog');

// Step 1: Run changelog injection
execSync(`node scripts/generate-release-note.js ${VERSION}`, { stdio: 'inherit' });

// Step 2: Find generated blog file
const date = new Date().toISOString().split('T')[0];
const file = path.join(blogPath, `${date}-release-${tag}.md`);

if (!fs.existsSync(file)) {
  console.error(`❌ Blog post not generated: ${file}`);
  process.exit(1);
}

// Step 3: Preview if enabled
if (PREVIEW) {
  const editor = process.env.EDITOR || 'code'; // fallback to VS Code
  try {
    execSync(`${editor} ${file}`, { stdio: 'inherit' });
  } catch (err) {
    console.warn('⚠️ Failed to open in editor. Please review manually:', file);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(`✅ Ready to commit and push ${tag}? (y/n): `, (answer) => {
    rl.close();
    if (answer.toLowerCase() !== 'y') {
      console.log('❌ Aborted. No tag pushed.');
      process.exit(0);
    }
    finalizeRelease();
  });
} else {
  finalizeRelease();
}

// Final tagging + push
function finalizeRelease() {
  execSync(`git add CHANGELOG.md ${file}`);
  execSync(`git commit -m "release: v${VERSION}"`);
  execSync(`git tag ${tag}`);
  execSync('git push && git push --tags');
  console.log(`🎉 Release ${tag} published and blog post staged!`);
}
