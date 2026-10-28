#!/usr/bin/env node

/**
 * Build Script for RAG Pipeline Utils
 * Creates CommonJS and ESM builds using esbuild
 */

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const distDir = path.resolve(__dirname, "../dist");
const entryPoint = path.resolve(__dirname, "../src/index.js");

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// All runtime dependencies should be external (not bundled)
const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"),
);
const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}).filter((d) =>
    ["isolated-vm"].includes(d),
  ),
];

// CommonJS build — self-contained bundle
esbuild.buildSync({
  entryPoints: [entryPoint],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node18",
  outfile: path.join(distDir, "index.cjs"),
  external,
  logLevel: "warning",
});

// ESM build — thin wrapper that re-exports named exports from CJS bundle
// This is the standard pattern used by most npm packages (axios, chalk, etc.)
const cjsModule = require(path.join(distDir, "index.cjs"));
const exportNames = Object.keys(cjsModule);

const esmWrapper = [
  "import { createRequire } from 'module';",
  "import { fileURLToPath } from 'url';",
  "import { dirname } from 'path';",
  "",
  "const __filename = fileURLToPath(import.meta.url);",
  "const __dirname = dirname(__filename);",
  "const require = createRequire(import.meta.url);",
  "",
  "const mod = require('./index.cjs');",
  "",
  `export const { ${exportNames.join(", ")} } = mod;`,
  "",
  "export default mod;",
  "",
].join("\n");

fs.writeFileSync(path.join(distDir, "index.mjs"), esmWrapper);

// ./experimental entry: reads the unwrapped classes that index.cjs attaches
// under a symbol, so both entries share one copy of each class.
const EXPERIMENTAL_KEY = "@devilsdev/rag-pipeline-utils/experimental";
fs.writeFileSync(
  path.join(distDir, "experimental.cjs"),
  [
    "'use strict';",
    `module.exports = require('./index.cjs')[Symbol.for('${EXPERIMENTAL_KEY}')];`,
    "",
  ].join("\n"),
);
const experimentalNames = Object.keys(cjsModule[Symbol.for(EXPERIMENTAL_KEY)]);
fs.writeFileSync(
  path.join(distDir, "experimental.mjs"),
  [
    "import { createRequire } from 'module';",
    "const require = createRequire(import.meta.url);",
    "const mod = require('./experimental.cjs');",
    `export const { ${experimentalNames.join(", ")} } = mod;`,
    "export default mod;",
    "",
  ].join("\n"),
);

console.log("Build completed successfully!");
console.log(`  CommonJS: ${path.join(distDir, "index.cjs")}`);
console.log(`  ESM:      ${path.join(distDir, "index.mjs")}`);
console.log(`  Experimental: ${path.join(distDir, "experimental.{cjs,mjs}")}`);
