/**
 * Version: 1.0.0
 * Description: Helper to find the previous Git semver tag before a given tag
 * Usage: node scripts/get-previous-tag.js v2.1.5
 * Output: v2.1.4
 * Author: Ali Kahwaji
 */

import { execSync } from 'child_process';

const currentTag = process.argv[2];

if (!currentTag) {
  console.error('❌ Usage: node get-previous-tag.js <current-tag>'); // eslint-disable-line no-console
  process.exit(1);
}

try {
  // Ensure full tag history
  execSync('git fetch --tags --unshallow 2>/dev/null || git fetch --tags', { stdio: 'inherit' });

  // List all tags sorted by version (most recent last), remove current tag
  const tags = execSync('git tag --sort=version:refname', { encoding: 'utf-8' })
    .split('\n')
    .map(tag => tag.trim())
    .filter(Boolean);

  const idx = tags.indexOf(currentTag);

  if (idx <= 0) {
    console.error('⚠️ Could not find previous tag before', currentTag); // eslint-disable-line no-console
    process.exit(1);
  }

  const previousTag = tags[idx - 1];
  console.log(previousTag); // eslint-disable-line no-console
} catch (err) {
  console.error('❌ Failed to resolve previous tag:', err.message); // eslint-disable-line no-console
  process.exit(1);
}
