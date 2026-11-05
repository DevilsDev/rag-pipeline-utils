/**
 * Version: 2.0.0
 * Description: Drafts the release blog post (scripts/generate-release-note.js),
 * optionally opens it for review, then commits and tags. Releases normally
 * use .github/workflows/release-blog.yml instead, which opens a pull request.
 * Author: Ali Kahwaji
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const readline = require("readline");

const VERSION = process.argv[2];
const PREVIEW = process.argv.includes("--preview");

if (!VERSION) {
  console.error("❌ Usage: node release-tag.js <version> [--preview]");
  // eslint-disable-line no-console
  process.exit(1);
}

const tag = `v${VERSION.replace(/^v/, "")}`;

// Step 1: Draft the blog post from the CHANGELOG (skipped if one exists)
const { generate } = require("./generate-release-note.js");
const result = generate({ version: VERSION });
const file = result.skipped ? null : path.relative(process.cwd(), result.path);

// Step 2: Check the draft was written
if (!file || !fs.existsSync(file)) {
  console.error(`❌ Blog post not generated: ${result.reason || file}`);
  // eslint-disable-line no-console
  process.exit(1);
}

// Step 3: Preview if enabled
if (PREVIEW) {
  const editor = process.env.EDITOR || "code"; // fallback to VS Code
  try {
    execSync(`${editor} ${file}`, { stdio: "inherit" });
  } catch (err) {
    console.warn("⚠️ Failed to open in editor. Please review manually:", file);
    // eslint-disable-line no-console
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question(`✅ Ready to commit and push ${tag}? (y/n): `, (answer) => {
    rl.close();
    if (answer.toLowerCase() !== "y") {
      console.log("❌ Aborted. No tag pushed.");
      // eslint-disable-line no-console
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
  execSync(`git commit -m "release: ${tag}"`);
  execSync(`git tag ${tag}`);
  execSync("git push && git push --tags");
  console.log(`🎉 Release ${tag} published and blog post staged!`);
  // eslint-disable-line no-console
}
