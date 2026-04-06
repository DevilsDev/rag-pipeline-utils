#!/usr/bin/env node

/**
 * Validate documentation code examples against actual API
 * Ensures documented method calls match the real implementation
 */

const fs = require("fs");
const path = require("path");
const fg = require("fast-glob");

const DEPRECATED_METHODS = ["pipeline.query(", "pipeline.ingest("];
const DOCS_DIRS = [
  "docs-site/docs/**/*.md",
  "docs-site/versioned_docs/**/*.md",
  "docs-site/blog/**/*.md",
  "docs-site/src/**/*.{js,jsx}",
  "README.md",
  "docs/**/*.md",
];

let errors = 0;

const cwd = path.resolve(__dirname, "..");
const files = fg.sync(DOCS_DIRS, { cwd, absolute: true });

for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  const relativePath = path.relative(cwd, file);

  for (const method of DEPRECATED_METHODS) {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(method)) {
        // Skip lines that are clearly describing the fix (e.g., in audit docs)
        const line = lines[i];
        if (
          line.includes("DONE:") ||
          line.includes("Changed all") ||
          line.includes("NOT ") ||
          line.includes("instead of") ||
          line.includes("wrong")
        ) {
          continue;
        }
        errors++;
        console.error(
          `ERROR: ${relativePath}:${i + 1} - Found deprecated "${method.slice(0, -1)}()" call`,
        );
        console.error(`  ${line.trim()}`);
      }
    }
  }
}

if (errors > 0) {
  console.error(`\nFound ${errors} deprecated API call(s) in documentation.`);
  console.error(
    "Use pipeline.run({ query }) instead of pipeline.query() or pipeline.ingest().",
  );
  process.exit(1);
} else {
  console.log(
    "Documentation validation passed - no deprecated API calls found.",
  );
}
