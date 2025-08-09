/**
const fs = require('fs');
const path = require('path');
 * Version: 1.0.0
 * Description: Rewrites blog .mdx files to use SSR-safe BlogImage.jsx import
 * Author: Ali Kahwaji
 */

import fs from 'fs';
import path from 'path';

const BLOG_DIR = path.resolve('docs-site', 'blog');
const TARGET_IMPORT = 'import BlogImage from \'../src/components/BlogImage\'';
const OLD_IMPORT_REGEX = /import\s+BlogImage\s+from\s+['"].+BlogImage[^'"]*['"];/g;

function fixImportInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');

  // If already correct, skip
  if (content.includes(TARGET_IMPORT)) {
    console.log(`✔️  ${path.basename(filePath)} already uses safe import.`); // eslint-disable-line no-console
    return;
  }

  const replaced = content.replace(OLD_IMPORT_REGEX, TARGET_IMPORT);

  if (replaced !== content) {
    fs.writeFileSync(filePath, replaced);
    console.log(`✅ Updated: ${path.basename(filePath)}`); // eslint-disable-line no-console
  } else {
    // No previous import, insert at top
    fs.writeFileSync(filePath, `${TARGET_IMPORT}\n\n${content}`);
    console.log(`➕ Injected import: ${path.basename(filePath)}`); // eslint-disable-line no-console
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const fullPath = path.join(dir, f);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath);
    } else if (f.endsWith('.mdx')) {
      fixImportInFile(fullPath);
    }
  }
}

console.log('🔍 Scanning MDX blog files...'); // eslint-disable-line no-console
walkDir(BLOG_DIR);
console.log('🎉 Import rewrite complete.'); // eslint-disable-line no-console
