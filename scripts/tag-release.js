/**
 * Version: 2.0.0
 * Description: Drafts the release blog post (scripts/generate-release-note.js),
 * optionally opens it for review, then commits and tags. Releases normally
 * use .github/workflows/release-blog.yml instead, which opens a pull request.
 * Author: Ali Kahwaji
 */

const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const readline = require("readline");

const VERSION = process.argv[2];
const PREVIEW = process.argv.includes("--preview");

if (!VERSION) {
  console.error("❌ Usage: node release-tag.js <version> [--preview]");
  // eslint-disable-line no-console
  process.exit(1);
}

const { generate, parseVersion } = require("./generate-release-note.js");
// Throws on anything but x.y.z / vx.y.z, so the tag is always plain.
const tag = `v${parseVersion(VERSION).version}`;

// Step 1: Draft the blog post from the CHANGELOG (skipped if one exists)
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
  // EDITOR may carry flags ("code --wait"); run it without a shell, with the
  // file as its own argument.
  const [editor, ...editorArgs] = (process.env.EDITOR || "code")
    .trim()
    .split(/\s+/); // fallback to VS Code
  const opened = spawnSync(editor, [...editorArgs, file], { stdio: "inherit" });
  if (opened.error || opened.status !== 0) {
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
  // Argument arrays, no shell: the file name and tag are never parsed by one.
  const git = (...args) => execFileSync("git", args, { stdio: "inherit" });
  git("add", "--", "CHANGELOG.md", file);
  git("commit", "-m", `release: ${tag}`);
  git("tag", tag);
  git("push");
  git("push", "--tags");
  console.log(`🎉 Release ${tag} published and blog post staged!`);
  // eslint-disable-line no-console
}
