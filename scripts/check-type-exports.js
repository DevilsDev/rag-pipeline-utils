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

// ./experimental: every runtime export must appear in the generated
// declaration's export list (dist/types/experimental.d.ts)
const experimentalExports = Object.keys(
  require(path.join(dist, "experimental.cjs")),
);
const experimentalDts = fs.readFileSync(
  path.join(dist, "types", "experimental.d.ts"),
  "utf8",
);
const exportedNames = new Set(
  [...experimentalDts.matchAll(/export\s*\{([^}]*)\}/g)].flatMap((m) =>
    m[1].split(",").map((part) =>
      part
        .trim()
        .split(/\s+as\s+/)
        .pop(),
    ),
  ),
);
const missingExperimental = experimentalExports.filter(
  (name) => !exportedNames.has(name),
);
if (missingExperimental.length > 0) {
  console.error(
    `❌ experimental export(s) missing from dist/experimental.d.ts: ${missingExperimental.join(", ")}`,
  );
  process.exit(1);
}
console.log(
  `✅ All ${experimentalExports.length} experimental exports are declared`,
);

// ./testing: same check against dist/types/testing.d.ts
const testingExports = Object.keys(require(path.join(dist, "testing.cjs")));
const testingDts = fs.readFileSync(
  path.join(dist, "types", "testing.d.ts"),
  "utf8",
);
const testingDeclared = new Set(
  [...testingDts.matchAll(/export\s*\{([^}]*)\}/g)].flatMap((m) =>
    m[1].split(",").map((part) =>
      part
        .trim()
        .split(/\s+as\s+/)
        .pop(),
    ),
  ),
);
// tsc writes these as `export class X` / `export function X` / `export const X`
for (const m of testingDts.matchAll(
  /^export\s+(?:declare\s+)?(?:class|function|const|let|var)\s+(\w+)/gm,
)) {
  testingDeclared.add(m[1]);
}
const missingTesting = testingExports.filter((n) => !testingDeclared.has(n));
if (missingTesting.length > 0) {
  console.error(
    `❌ testing export(s) missing from dist/testing.d.ts: ${missingTesting.join(", ")}`,
  );
  process.exit(1);
}
console.log(`✅ All ${testingExports.length} testing exports are declared`);

// ./edge: re-exports from dist/index.d.ts, so each name must be declared
// there and listed in dist/edge.d.ts.
const edgeExports = Object.keys(require("../src/edge.js"));
const edgeDts = fs.readFileSync(path.join(dist, "edge.d.ts"), "utf8");
const edgeListed = new Set(
  (edgeDts.match(/export\s*\{([^}]*)\}/) || ["", ""])[1]
    .split(",")
    .map((name) => name.trim()),
);
const missingEdge = edgeExports.filter(
  (name) => !declared.has(name) || !edgeListed.has(name),
);
if (missingEdge.length > 0) {
  console.error(
    `❌ edge export(s) missing from dist/edge.d.ts or dist/index.d.ts: ${missingEdge.join(", ")}`,
  );
  process.exit(1);
}
console.log(`✅ All ${edgeExports.length} edge exports are declared`);
