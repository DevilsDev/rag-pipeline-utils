#!/usr/bin/env node

/**
 * Keeps the scoped packages in lockstep with @devilsdev/rag-pipeline-utils:
 * sets each packages/<name>/package.json version (and their dependencies
 * on each other), and the main package's dependency on each, to the main
 * package's version, then updates package-lock.json. The standalone
 * @devilsdev/rag-mcp-server and create-rag-pipeline get the same version and pins, without the
 * main package depending on it.
 *
 * Runs as the `version` lifecycle script, so `npm version <x>` bumps all
 * seven together; `npm run build` fails when they disagree.
 *
 * Usage: node scripts/sync-package-versions.js
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { PACKAGES, OUT } = require("./build-packages");

const ROOT = path.resolve(__dirname, "..");
const rootFile = path.join(ROOT, "package.json");
const root = JSON.parse(fs.readFileSync(rootFile, "utf8"));
const names = new Set(PACKAGES.map((p) => p.name));

const write = (file, json) =>
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);

for (const name of names) root.dependencies[name] = root.version;
write(rootFile, root);

// Hand-written packages in packages/ that build-packages.js doesn't
// generate. They ship with the same version and pin the scoped packages,
// but the main package does not depend on them (rag-mcp-server brings the
// MCP SDK, which stays out of the main package's install).
const STANDALONE = ["rag-mcp-server", "create-rag-pipeline"];

const dirs = [...PACKAGES.map((p) => p.name.split("/")[1]), ...STANDALONE];
for (const dir of dirs) {
  const file = path.join(OUT, dir, "package.json");
  if (!fs.existsSync(file)) continue;
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  json.version = root.version;
  for (const dep of Object.keys(json.dependencies || {})) {
    if (names.has(dep)) json.dependencies[dep] = root.version;
  }
  write(file, json);
}

execFileSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  [
    "install",
    "--package-lock-only",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
  ],
  { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" },
);
console.log(`Scoped packages and their dependencies set to ${root.version}`);
