#!/usr/bin/env node

/**
 * Build Script for RAG Pipeline Utils
 * Creates CommonJS and ESM builds for npm distribution
 */

const fs = require("fs");
const path = require("path");

const srcPath = path.resolve(__dirname, "../src/index.js");
const distDir = path.resolve(__dirname, "../dist");
const cjsPath = path.join(distDir, "index.cjs");
const mjsPath = path.join(distDir, "index.mjs");

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Read source file
const sourceCode = fs.readFileSync(srcPath, "utf8");

// Fix relative paths for dist build (they need to point to src from dist)
const fixedSourceCode = sourceCode.replace(
  /require\('\.\/([^']+)'\)/g,
  "require('../src/$1')",
);

// Create CommonJS build with fixed paths
fs.writeFileSync(cjsPath, fixedSourceCode);

// Create ESM build (convert require/module.exports to import/export)
const esmCode = fixedSourceCode
  .replace(
    /const\s+{\s*([^}]+)\s*}\s*=\s*require\('([^']+)'\);/g,
    'import { $1 } from "$2";',
  )
  .replace(/const\s+(\w+)\s*=\s*require\('([^']+)'\);/g, 'import $1 from "$2";')
  .replace(/module\.exports\s*=\s*{([^}]+)};/, "export { $1 };")
  .replace(/module\.exports\s*=\s*([^;]+);/, "export default $1;");

fs.writeFileSync(mjsPath, esmCode);

console.log("✅ Build completed successfully!");
console.log(`📦 CommonJS: ${cjsPath}`);
console.log(`📦 ESM: ${mjsPath}`);
