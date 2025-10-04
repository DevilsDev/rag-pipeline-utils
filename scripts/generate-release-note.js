#!/usr/bin/env node

/**
 * Release Note Generator
 * Version: 3.0.0
 * Description: Generates changelog section and blog markdown from a GitHub tag
 * Author: Ali Kahwaji
 */

const fs = require("fs");
const path = require("path");
const { setupCLI, dryRunWrapper, _validateArgs } = require("./utils/cli.js");
const { withRetry } = require("./utils/retry.js");
const { sh } = require("./lib/sh.js");

// Load configuration
const configPath = path.resolve(__dirname, "scripts._config.json");
const _config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

// Setup CLI
const { args, logger } = setupCLI(
  "generate-release-note.js",
  "Generate release notes and blog posts from Git tags",
  {
    "--version": "Version tag to generate notes for (required)",
    "--skip-git": "Skip git operations (commit and push)",
    "--blog-only": "Only generate blog post, skip changelog",
    "--changelog-only": "Only generate changelog, skip blog post",
  },
);

// Validate required arguments
const version = args.version || args._[0];
if (!version) {
  logger.error("Version argument is required");
  logger.info("Usage: node generate-release-note.js --version v1.2.3");
  process.exit(1);
}

const newVersion = version.startsWith("v") ? version : `v${version}`;

/**
 * Resolves previous Git tag for comparison.
 * @returns {string|null}
 */
function resolvePreviousTag() {
  return withRetry(
    () => {
      logger.debug("Fetching Git tags...");
      const result = sh("git", ["tag", "--sort=-creatordate"]);
      const tags = result.stdout.split("\n").filter(Boolean);

      logger.debug(
        `Found ${tags.length} tags: ${tags.slice(0, 5).join(", ")}...`,
      );

      const idx = tags.indexOf(newVersion);
      const prevTag = tags[idx + 1] || tags[1] || null;

      if (!prevTag) {
        throw new Error("No previous tag found for comparison");
      }

      logger.info(`Comparing ${prevTag} → ${newVersion}`);
      return prevTag;
    },
    {
      maxAttempts: 2,
      operation: "resolve previous Git tag",
    },
  );
}

const prevVersion = resolvePreviousTag();
if (!prevVersion) {
  console.error("❌ Could not resolve previous tag.");
  // eslint-disable-line no-console
  process.exit(1);
}

/**
 * Get commit messages between two tags.
 * @param {string} from
 * @param {string} to
 * @returns {string}
 */
function getCommits(_from, _to) {
  return withRetry(
    () => {
      logger.debug(`Fetching commits between ${_from}..${_to}`);
      const result = sh("git", [
        "log",
        `${_from}..${_to}`,
        "--pretty=format:- %s",
      ]);
      const commits = result.stdout;

      const commitCount = commits.split("\n").filter(Boolean).length;
      logger.info(`Found ${commitCount} commits since ${_from}`);

      return commits;
    },
    {
      maxAttempts: 2,
      operation: "fetch Git commits",
    },
  );
}

/**
 * Generate blog post markdown.
 * @param {string} version
 * @param {string} commits
 * @param {string} prevVersion
 * @returns {string}
 */
function generateBlogMarkdown(_version, _commits, _prevVersion) {
  const date = new Date().toISOString().slice(0, 10);
  const slug = `release-${_version}`;
  const repoUrl = `https://github.com/${_config.github.owner}/${_config.github.repo}`;

  return `---
slug: ${slug}
title: "🚀 Version ${_version} Released"
authors: [ali]
tags: [release, changelog]
date: ${date}
---

RAG Pipeline Utils **${_version}** is now available on NPM!

## 🔧 Changes

${_commits}

## 🔗 Resources

- 📦 [NPM Package](https://www.npmjs.com/package/@DevilsDev/rag-pipeline-utils)
- 🔍 [GitHub Compare](${repoUrl}/compare/${_prevVersion}...${_version})
- 📋 [Full Changelog](${repoUrl}/blob/main/CHANGELOG.md)
- 🐛 [Report Issues](${repoUrl}/issues)

---

*Happy coding! 🎉*
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

/**
 * Main execution function
 */
async function main() {
  try {
    logger.info(`Generating release notes for ${newVersion}`);

    // Resolve previous version
    const prevVersion = await resolvePreviousTag();

    // Get commits
    const commits = await getCommits(prevVersion, newVersion);

    if (!commits.trim()) {
      logger.warn("No commits found between versions");
      return;
    }

    // Generate content
    const blogContent = generateBlogMarkdown(newVersion, commits, prevVersion);
    const changelogSection = generateChangelogSection(commits);

    // Write files
    const date = new Date().toISOString().slice(0, 10);
    const blogPath = path.resolve(
      __dirname,
      `../${_config.release.blogPath}/${date}-${newVersion}.md`,
    );
    const changelogPath = path.resolve(
      __dirname,
      `../${_config.release.changelogPath}`,
    );

    if (!args.changelogOnly) {
      await dryRunWrapper(
        args.dryRun,
        `Write blog post: ${path.basename(blogPath)}`,
        async () => {
          fs.mkdirSync(path.dirname(blogPath), { recursive: true });
          fs.writeFileSync(blogPath, blogContent, "utf-8");
        },
      );
    }

    if (!args.blogOnly) {
      await dryRunWrapper(
        args.dryRun,
        `Append to changelog: ${path.basename(changelogPath)}`,
        async () => {
          fs.appendFileSync(changelogPath, `\n${changelogSection}`, "utf-8");
        },
      );
    }

    // Git operations
    if (!args.skipGit && !args.dryRun) {
      await withRetry(
        async () => {
          logger.progress("Committing changes to Git...");
          sh("git", ["config", "user.name", "github-actions[bot]"]);
          sh("git", [
            "config",
            "user.email",
            "41898282+github-actions[bot]@users.noreply.github.com",
          ]);
          sh("git", ["add", "CHANGELOG.md", "docs-site/blog/*.md"]);
          sh("git", [
            "commit",
            "-m",
            `docs(release): blog + changelog for ${newVersion}`,
          ]);
          sh("git", ["push", "origin", "main"]);
        },
        {
          maxAttempts: 2,
          operation: "Git commit and push",
        },
      );
      logger.success("Changes committed and pushed to Git");
    } else if (args.skipGit) {
      logger.info("Git operations skipped (--skip-git flag)");
    }

    // Show previews
    if (args.verbose || args.dryRun) {
      logger.info("\n📓 Blog Content Preview:");
      console.log("\n" + blogContent);
      // eslint-disable-line no-console

      logger.info("\n📘 Changelog Section Preview:");
      console.log("\n" + changelogSection);
      // eslint-disable-line no-console
    }

    logger.success(`🚀 Release notes generated for ${newVersion}!`);
  } catch (error) {
    logger.error(`Release note generation failed: ${error.message}`);
    if (args.verbose) {
      logger.error(error.stack);
    }
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}
