#!/usr/bin/env node

/**
 * Keeps the scoped packages in lockstep with @devilsdev/rag-pipeline-utils:
 * sets each packages/<name>/package.json version (and their dependencies
 * on each other), and the main package's dependency on each, to the main
 * package's version, then updates package-lock.json.
 *
 * Runs as the `version` lifecycle script, so `npm version <x>` bumps all
 * five together; `npm run build` fails when they disagree.
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

for (const pkg of PACKAGES) {
  const file = path.join(OUT, pkg.name.split("/")[1], "package.json");
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
