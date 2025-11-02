/**
 * Version: 1.1.0
 * Description: Ensures CHANGELOG.md contains the current version and auto-corrects format if needed.
 * Author: Ali Kahwaji
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// __filename and __dirname are available as global variables in CommonJS

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../package.json")),
);
const version = pkg.version;
const changelogPath = path.resolve(__dirname, "../CHANGELOG.md");

let changelog = fs.readFileSync(changelogPath, "utf-8");

// Step 1: Normalize invalid headings like "# [2.0.0](...)"
const normalized = changelog.replace(
  /^# \[([0-9]+\.[0-9]+\.[0-9]+)\]\([^)]+\)/gm,
  (match, v) => {
    const today = new Date().toISOString().split("T")[0];
    return `## [${v}] - ${today}`;
  },
);

// Step 2: Update file if normalization occurred
if (normalized !== changelog) {
  fs.writeFileSync(changelogPath, normalized);
  console.log(`🛠️  CHANGELOG.md heading normalized for version ${version}`);
  // eslint-disable-line no-console
  changelog = normalized;

  // Auto-stage if in git project (Husky compatibility)
  try {
    execSync(`git add ${changelogPath}`);
    console.log("CHANGELOG.md staged after correction");
    // eslint-disable-line no-console
  } catch {
    // Non-fatal
  }
}

// Step 3: Validate presence of correct heading (non-blocking)
const headingPattern = new RegExp(`^## \\[${version}\\]`, "m");
if (!headingPattern.test(changelog)) {
  console.warn(
    `⚠️  CHANGELOG.md does not contain a properly formatted entry for version ${version}`,
  );
  // eslint-disable-line no-console
  console.warn("This will be required for releases but won't block commits.");
  // eslint-disable-line no-console
  process.exit(0); // Exit successfully to avoid blocking commits
}

console.log(`✅ CHANGELOG.md contains a valid entry for version ${version}`);
// eslint-disable-line no-console
