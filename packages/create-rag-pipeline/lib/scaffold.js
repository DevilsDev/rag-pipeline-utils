"use strict";

/**
 * Copies a starter template into a new directory: `npm create rag-pipeline`.
 *
 * The templates pin @devilsdev/rag-pipeline-utils to this package's own
 * version (the two are released together), so a starter never asks for an
 * older library than the one it was written for. Node built-ins only.
 */

const fs = require("fs");
const path = require("path");

const { version } = require("../package.json");

const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

/** The starters, in the order the prompt lists them. */
const TEMPLATES = {
  next: "Next.js and the AI SDK: a chat page and an API route that answer from your documents, with grounding checks",
  mastra:
    "Mastra: an agent with a document-search tool, a groundedness scorer and guardrails",
  workers:
    "Cloudflare Workers: a RAG API with in-memory retrieval and streamed answers",
};

// npm drops .gitignore from published tarballs, so templates ship it under
// another name and it is renamed on copy
const RENAME = { _gitignore: ".gitignore" };

const LIBRARY = "@devilsdev/rag-pipeline-utils";

const isSeparator = (c) => c === "-" || c === "." || c === "_";

/** A valid npm package name from a directory name. */
function packageName(dir) {
  const name = path
    .basename(path.resolve(dir))
    .toLowerCase()
    .replace(/[^a-z0-9-._~]+/g, "-");
  // Trim separators from both ends (a loop, not a regex: no backtracking)
  let start = 0;
  let end = name.length;
  while (start < end && isSeparator(name[start])) start++;
  while (end > start && isSeparator(name[end - 1])) end--;
  return name.slice(start, end) || "rag-app";
}

function isEmptyDir(dir) {
  return !fs.existsSync(dir) || fs.readdirSync(dir).length === 0;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, RENAME[entry.name] || entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

/**
 * Create a project from a template.
 *
 * @param {Object} options
 * @param {string} options.template - One of the keys of TEMPLATES
 * @param {string} options.dir - Directory to create; must be empty or missing
 * @param {string} [options.libraryVersion] - Version range for the library (default `^<this version>`)
 * @returns {{ dir: string, name: string, template: string }}
 */
function scaffold({ template, dir, libraryVersion = `^${version}` }) {
  if (!TEMPLATES[template]) {
    throw new Error(
      `Unknown template "${template}". Use one of: ${Object.keys(TEMPLATES).join(", ")}`,
    );
  }
  if (!dir) throw new Error("Give a directory for the new project");
  const target = path.resolve(dir);
  if (!isEmptyDir(target)) {
    throw new Error(`${target} is not empty; choose a new directory`);
  }

  copyDir(path.join(TEMPLATES_DIR, template), target);

  const pkgFile = path.join(target, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
  const name = packageName(target);
  pkg.name = name;
  pkg.dependencies[LIBRARY] = libraryVersion;
  fs.writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);

  // A Worker's name is its URL on workers.dev
  const wrangler = path.join(target, "wrangler.toml");
  if (fs.existsSync(wrangler)) {
    const toml = fs.readFileSync(wrangler, "utf8");
    fs.writeFileSync(
      wrangler,
      toml.replace(/^name = ".*"$/m, `name = "${name}"`),
    );
  }

  return { dir: target, name, template };
}

module.exports = { scaffold, TEMPLATES, packageName, version };
