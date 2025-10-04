/**
 * Version: 1.0.0
 * Description: Helper to find the previous Git semver tag before a given tag
 * Usage: node scripts/get-previous-tag.js v2.1.5
 * Output: v2.1.4
 * Author: Ali Kahwaji
 */

const { sh } = require("./lib/sh.js");

const currentTag = process.argv[2];

if (!currentTag) {
  console.error("❌ Usage: node get-previous-tag.js <current-tag>");
  // eslint-disable-line no-console
  process.exit(1);
}

try {
  // Ensure full tag history
  try {
    sh("git", ["fetch", "--tags", "--unshallow"], { throwOnError: false });
  } catch {
    sh("git", ["fetch", "--tags"]);
  }

  // List all tags sorted by version (most recent last), remove current tag
  const result = sh("git", ["tag", "--sort=version:refname"]);
  const tags = result.stdout
    .split("\n")
    .map((tag) => tag.trim())
    .filter(Boolean);

  const idx = tags.indexOf(currentTag);

  if (idx <= 0) {
    console.error("⚠️ Could not find previous tag before", currentTag);
    // eslint-disable-line no-console
    process.exit(1);
  }

  const previousTag = tags[idx - 1];
  console.log(previousTag);
  // eslint-disable-line no-console
} catch (err) {
  console.error("❌ Failed to resolve previous tag:", err.message);
  // eslint-disable-line no-console
  process.exit(1);
}
