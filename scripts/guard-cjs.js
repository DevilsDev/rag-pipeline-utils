#!/usr/bin/env node
/* eslint-disable no-console */
const { readFileSync, readdirSync, statSync } = require("fs");
const { join } = require("path");
const acorn = require("acorn");

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, files);
    else if (p.endsWith(".js")) files.push(p);
  }
  return files;
}

const offenders = [];
for (const file of walk("src")) {
  const src = readFileSync(file, "utf8");
  try {
    // Parse as a module so true export declarations are visible; strings/templates are ignored
    const ast = acorn.parse(src, {
      ecmaVersion: "latest",
      sourceType: "module",
    });
    const hasExport = ast.body.some(
      (n) =>
        n.type === "ExportNamedDeclaration" ||
        n.type === "ExportDefaultDeclaration",
    );
    if (hasExport) offenders.push(file);
  } catch (_) {
    // CJS files won't parse as "module" and that's fine; we only care about actual export decls
  }
}

if (offenders.length) {
  console.error("\n❌ ESM export syntax detected in src/");
  console.error("The following files contain forbidden ESM exports:");
  for (const f of offenders) console.error("  " + f);
  process.exit(1);
}
