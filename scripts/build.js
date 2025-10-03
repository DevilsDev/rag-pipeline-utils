#!/usr/bin/env node

/**
 * Build Script for RAG Pipeline Utils
 * Creates CommonJS and ESM builds for npm distribution
 *
 * CJS: Simple path fixup
 * ESM: Manual conversion with proper import syntax
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

// Create ESM build by converting require/module.exports to import/export
// and adding .js extensions for ESM compatibility
let esmCode = sourceCode
  // Convert destructured require to named imports with .js extension
  .replace(
    /const\s+{\s*([^}]+)\s*}\s*=\s*require\(['"]\.\/([^'"]+)['"]\);/g,
    (match, names, modulePath) => {
      return `import { ${names} } from '../src/${modulePath}.js';`;
    },
  )
  // Convert default require to default import with .js extension
  .replace(
    /const\s+(\w+)\s*=\s*require\(['"]\.\/([^'"]+)['"]\);/g,
    (match, varName, modulePath) => {
      return `import ${varName} from '../src/${modulePath}.js';`;
    },
  )
  // Convert module.exports object to named exports
  .replace(/module\.exports\s*=\s*\{([^}]+)\};/s, (match, exportsContent) => {
    // Extract property names and handle aliases
    const lines = exportsContent
      .split(",")
      .map((line) => line.trim())
      .filter(Boolean);
    const exports = [];
    const aliases = [];

    for (const line of lines) {
      // Skip comments
      if (line.startsWith("//")) continue;

      // Check for alias pattern "newName: originalName"
      const aliasMatch = line.match(/(\w+):\s*(\w+)(?:\s*\/\/.*)?$/);
      if (aliasMatch && aliasMatch[1] !== aliasMatch[2]) {
        // This is an alias - we'll export it separately
        aliases.push(`export const ${aliasMatch[1]} = ${aliasMatch[2]};`);
        // Don't add to main export block
        continue;
      }

      // Regular export or shorthand property
      const identifierMatch = line.match(/(\w+)(?::\s*\w+)?/);
      if (identifierMatch) {
        exports.push(identifierMatch[1]);
      }
    }

    let result = `export {\n  ${exports.join(",\n  ")}\n};`;
    if (aliases.length > 0) {
      result += "\n\n// Backward compatibility aliases\n" + aliases.join("\n");
    }
    return result;
  });

// Add ESM header
esmCode =
  `/**
 * RAG Pipeline Utils - ESM Build
 * Main entry point for ES module consumers
 */

` + esmCode;

fs.writeFileSync(mjsPath, esmCode);

console.log("✅ Build completed successfully!");
console.log(`📦 CommonJS: ${cjsPath}`);
console.log(`📦 ESM: ${mjsPath}`);
