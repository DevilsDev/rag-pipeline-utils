# ESM Build Fix Required Before v2.1.7 Release

## Problem

The current build script cannot produce a valid ESM build because:

1. It tries to import CommonJS source files from `../src/`
2. Node.js ESM cannot use named imports from CommonJS without bundling

## Solution Options

### Option A: Use esbuild for ESM (Recommended)

Already a devDependency. Fast, reliable, handles CommonJS→ESM interop.

```javascript
// scripts/build.js (PROPOSED CHANGES)
const esbuild = require("esbuild");
const path = require("path");

// CommonJS build (existing logic - keep as-is)
// ... current CJS build code ...

// ESM build using esbuild
await esbuild.build({
  entryPoints: [path.resolve(__dirname, "../src/index.js")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  outfile: path.join(distDir, "index.mjs"),
  external: [
    // Mark all production dependencies as external
    "@octokit/rest",
    "ajv",
    "axios",
    "chalk",
    "commander",
    "csv-parse",
    "dotenv",
    "fast-glob",
    "framer-motion",
    "inquirer",
    "isolated-vm",
    "jsdom",
    "octokit",
    "openai",
    "pino",
    "plaiceholder",
    "sharp",
  ],
  sourcemap: true,
});
```

### Option B: Remove ESM Support Temporarily

Remove `exports["."].import` from package.json until proper bundling is configured.

```json
"exports": {
  ".": {
    "require": "./dist/index.cjs"
    // Remove "import": "./dist/index.mjs"
  },
  "./cli": "./bin/cli.js"
}
```

### Option C: Dual-Module Strategy (Complex)

Create true ES modules in src/ alongside CommonJS, maintain both.
**Not recommended** - high maintenance burden.

## Recommendation

**Use Option A (esbuild)** - it's already a dependency, handles this exact use case, and is production-ready.

## Timeline Impact

- Implementing esbuild: ~30 minutes
- Testing ESM build: ~15 minutes
- Total delay: ~45 minutes before publish
