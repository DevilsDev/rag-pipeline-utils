#!/usr/bin/env node

/**
 * Fail if any runtime export of dist/index.cjs has no declaration in
 * dist/index.d.ts. Run after `npm run build`.
 *
 * Usage: node scripts/check-type-exports.js
 */

const fs = require("fs");
const path = require("path");

const dist = path.resolve(__dirname, "..", "dist");
const runtimeExports = Object.keys(require(path.join(dist, "index.cjs")));
const dts = fs.readFileSync(path.join(dist, "index.d.ts"), "utf8");

const declared = new Set();
const declarationPattern =
  /export\s+(?:declare\s+)?(?:abstract\s+)?(?:const|let|var|function|class|enum)\s+([A-Za-z_$][\w$]*)/g;
for (const match of dts.matchAll(declarationPattern)) declared.add(match[1]);

// export { a, b as c } — the exported name is the alias when present
for (const match of dts.matchAll(/export\s*\{([^}]*)\}/g)) {
  for (const part of match[1].split(",")) {
    const name = part
      .trim()
      .split(/\s+as\s+/)
      .pop();
    if (name) declared.add(name);
  }
}

const missing = runtimeExports.filter((name) => !declared.has(name));
if (missing.length > 0) {
  console.error(
    `❌ ${missing.length} runtime export(s) missing from dist/index.d.ts:\n  ${missing.join("\n  ")}`,
  );
  process.exit(1);
}
console.log(`✅ All ${runtimeExports.length} runtime exports are declared`);
