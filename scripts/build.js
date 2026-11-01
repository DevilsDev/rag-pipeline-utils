#!/usr/bin/env node

/**
 * Build Script for RAG Pipeline Utils
 * Creates CommonJS and ESM builds using esbuild
 */

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const { writeThirdPartyLicenses } = require("./lib/third-party-licenses");
const {
  assignFiles,
  scopedModulesPlugin,
  assertNoCopies,
} = require("./build-packages");

const root = path.resolve(__dirname, "..");
const distDir = path.resolve(__dirname, "../dist");
const entryPoint = path.resolve(__dirname, "../src/index.js");

async function main() {
  // Ensure dist directory exists
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Runtime dependencies are external (installed with the package); anything
  // else a bundle uses, such as the CLI's prompts and colours (devDependencies),
  // is bundled, with its license notices in <bundle>.LICENSES.txt.
  const pkg = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"),
  );
  const external = [
    ...Object.keys(pkg.dependencies || {}),
    // Optional peers (openai, pg, isolated-vm, pino-pretty) load on first use
    // from the user's install; never bundled.
    ...Object.keys(pkg.peerDependencies || {}),
  ];

  // The main package re-exports the scoped packages (@devilsdev/rag-core,
  // -connectors, -eval, -guardrails; scripts/build-packages.js builds them
  // first): its bundles load their modules from them, never a copy, so the
  // classes are the same objects whichever package they come from.
  const owners = assignFiles();
  const fromPackages = scopedModulesPlugin(owners, null);

  // CommonJS build
  const libraryBuild = await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node22",
    outfile: path.join(distDir, "index.cjs"),
    external,
    plugins: [fromPackages],
    metafile: true,
    logLevel: "warning",
  });
  assertNoCopies(libraryBuild.metafile, owners, "dist/index.cjs");
  writeThirdPartyLicenses(
    libraryBuild.metafile,
    path.join(distDir, "index.cjs"),
    root,
  );

  // The rag-pipeline CLI, bundled so the package doesn't ship src/. bin/cli.js
  // loads it (and falls back to src/ in a development checkout).
  const cliBuild = await esbuild.build({
    entryPoints: [path.resolve(__dirname, "../src/cli.js")],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node22",
    outfile: path.join(distDir, "cli.cjs"),
    external,
    // It bundles the CLI's prompts and colours: whitespace and syntax only,
    // so names stay readable in stack traces.
    minifyWhitespace: true,
    minifySyntax: true,
    plugins: [fromPackages],
    metafile: true,
    logLevel: "warning",
  });
  assertNoCopies(cliBuild.metafile, owners, "dist/cli.cjs");
  writeThirdPartyLicenses(
    cliBuild.metafile,
    path.join(distDir, "cli.cjs"),
    root,
  );

  // The ./edge entry: src/edge.js as one self-contained ES module with no
  // Node.js APIs, for Vercel Edge, Workers without nodejs_compat, Deno and
  // browsers. Node's crypto, events and pino are replaced by Web API versions;
  // the other built-ins the library loads on import (for files and plugins on
  // disk, which the entry leaves out) by stubs that throw when used. Anything
  // else Node-only fails this build.
  const edgeDir = path.resolve(__dirname, "../src/edge");
  const unavailable = path.join(edgeDir, "unavailable.js");
  const NODE_STUBS = [
    "fs",
    "fs/promises",
    "path",
    "os",
    "url",
    "util",
    "http",
    "https",
    "perf_hooks",
    "async_hooks",
    "child_process",
    "zlib",
    // Code-generating (new Function), which edge runtimes forbid; only plugin
    // manifests use it.
    "ajv",
    "ajv-formats",
  ];
  // A CommonJS entry bundles to a default export only; re-export its names.
  const edgeNames = Object.keys(require("../src/edge.js"));
  const edgeBuild = esbuild.buildSync({
    stdin: {
      contents: [
        'import edge from "./edge.js";',
        `export const { ${edgeNames.join(", ")} } = edge;`,
        "export default edge;",
      ].join("\n"),
      resolveDir: path.resolve(__dirname, "../src"),
      sourcefile: "edge-entry.mjs",
    },
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    outfile: path.join(distDir, "edge.mjs"),
    alias: {
      crypto: path.join(edgeDir, "crypto.js"),
      pino: path.join(edgeDir, "pino.js"),
      events: require.resolve("events/"),
      "@opentelemetry/api": path.join(edgeDir, "no-otel-api.js"),
      ...Object.fromEntries(NODE_STUBS.map((name) => [name, unavailable])),
    },
    // Vercel Edge has process.env; Workers without nodejs_compat and browsers
    // have no process at all.
    banner: {
      js: "var process = globalThis.process || { env: {} };",
    },
    metafile: true,
    logLevel: "warning",
  });
  writeThirdPartyLicenses(
    edgeBuild.metafile,
    path.join(distDir, "edge.mjs"),
    root,
  );

  // Edge runtimes forbid require() and have no Node built-ins: a stray one
  // (an external left by a future change) must fail the build, not a deploy.
  {
    const edgeSource = fs.readFileSync(path.join(distDir, "edge.mjs"), "utf8");
    // A require() of an external becomes __require("name"); imports would be
    // top-level statements. (The logger's guarded require.resolve() probe for
    // pino-pretty returns false on the edge.)
    const stray = [
      /\b__require\d*\(\s*["']/,
      /^\s*import\s[^;]*?from\s*["']/m,
      /^\s*export\s[^;]*?from\s*["']/m,
      /\bimport\s*\(\s*["']/,
    ].filter((pattern) => pattern.test(edgeSource));
    if (stray.length) {
      throw new Error(
        `dist/edge.mjs must be self-contained, found: ${stray.join(", ")}`,
      );
    }
  }

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

  // ./experimental entry: reads the module that index.cjs attaches under a
  // symbol, so it is bundled once with the main entry.
  const EXPERIMENTAL_KEY = "@devilsdev/rag-pipeline-utils/experimental";
  fs.writeFileSync(
    path.join(distDir, "experimental.cjs"),
    [
      "'use strict';",
      `module.exports = require('./index.cjs')[Symbol.for('${EXPERIMENTAL_KEY}')];`,
      "",
    ].join("\n"),
  );
  const experimentalNames = Object.keys(
    cjsModule[Symbol.for(EXPERIMENTAL_KEY)],
  );
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

  // ./testing entry: reads src/testing.js through the main bundle (see the
  // getter in src/index.js), so it shares one copy of each class.
  const TESTING_KEY = "@devilsdev/rag-pipeline-utils/testing";
  fs.writeFileSync(
    path.join(distDir, "testing.cjs"),
    [
      "'use strict';",
      `module.exports = require('./index.cjs')[Symbol.for('${TESTING_KEY}')];`,
      "",
    ].join("\n"),
  );
  const testingNames = Object.keys(cjsModule[Symbol.for(TESTING_KEY)]);
  fs.writeFileSync(
    path.join(distDir, "testing.mjs"),
    [
      "import { createRequire } from 'module';",
      "const require = createRequire(import.meta.url);",
      "const mod = require('./testing.cjs');",
      `export const { ${testingNames.join(", ")} } = mod;`,
      "export default mod;",
      "",
    ].join("\n"),
  );

  console.log("Build completed successfully!");
  console.log(`  CommonJS: ${path.join(distDir, "index.cjs")}`);
  console.log(`  ESM:      ${path.join(distDir, "index.mjs")}`);
  console.log(
    `  Experimental: ${path.join(distDir, "experimental.{cjs,mjs}")}`,
  );
  console.log(`  Testing:      ${path.join(distDir, "testing.{cjs,mjs}")}`);
  console.log(`  Edge:         ${path.join(distDir, "edge.mjs")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
