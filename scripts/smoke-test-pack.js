#!/usr/bin/env node

/**
 * Consumer smoke test for the published tarball.
 *
 * Packs the package, installs it into a fresh temp project (production deps
 * only, so devDependencies cannot mask a missing runtime dependency), then
 * checks that require(), import() and the CLI all work and that importing the
 * package prints nothing.
 *
 * Usage: node scripts/smoke-test-pack.js [--keep]
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const keep = process.argv.includes("--keep");
const isWin = process.platform === "win32";
const npm = isWin ? "npm.cmd" : "npm";

function run(cmd, args, cwd) {
  return execFileSync(cmd, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    // npm is a .cmd shim on Windows and needs a shell; node does not (and its
    // path may contain spaces, which a shell would split).
    shell: isWin && cmd === npm,
  });
}

function check(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    return true;
  } catch (error) {
    const detail = (error.stderr || error.stdout || error.message || "")
      .toString()
      .trim()
      .split("\n")
      .slice(0, 8)
      .join("\n      ");
    console.error(`  ❌ ${name}\n      ${detail}`);
    return false;
  }
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-smoke-"));
console.log(`📦 Packing into ${workDir}`);
const packOutput = run(
  npm,
  ["pack", "--silent", "--pack-destination", workDir],
  root,
);
const tarball = path.join(workDir, packOutput.trim().split("\n").pop());

const consumerDir = path.join(workDir, "consumer");
fs.mkdirSync(consumerDir);
fs.writeFileSync(
  path.join(consumerDir, "package.json"),
  JSON.stringify({ name: "smoke-consumer", version: "1.0.0", private: true }),
);
console.log("📥 Installing tarball into a clean consumer project");
run(
  npm,
  [
    "install",
    "--omit=dev",
    "--no-audit",
    "--no-fund",
    "--ignore-scripts",
    tarball,
  ],
  consumerDir,
);

const pkgName = require(path.join(root, "package.json")).name;
const results = [
  check("require() loads with no console output", () => {
    const out = run(
      process.execPath,
      [
        "-e",
        `const m=require('${pkgName}');` +
          "if(typeof m.createRagPipeline!=='function')throw new Error('createRagPipeline missing');",
      ],
      consumerDir,
    );
    if (out.trim()) throw new Error(`unexpected output:\n${out}`);
  }),
  check("import() loads", () => {
    run(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const m=await import('${pkgName}');` +
          "if(typeof m.createRagPipeline!=='function')throw new Error('createRagPipeline missing');",
      ],
      consumerDir,
    );
  }),
  check("CLI --help runs", () => {
    const binPath = path.join(
      consumerDir,
      "node_modules",
      ...pkgName.split("/"),
      "bin",
      "cli.js",
    );
    run(process.execPath, [binPath, "--help"], consumerDir);
    // Every command group loads its modules (catches undeclared deps)
    for (const command of [
      "init",
      "ingest",
      "query",
      "run",
      "serve",
      "doctor",
      "validate",
      "config",
      "info",
      "hub",
    ]) {
      run(process.execPath, [binPath, command, "--help"], consumerDir);
    }
  }),
  check("CLI init -> ingest -> query works offline", () => {
    const binPath = path.join(
      consumerDir,
      "node_modules",
      ...pkgName.split("/"),
      "bin",
      "cli.js",
    );
    const docsDir = path.join(consumerDir, "docs");
    fs.mkdirSync(docsDir);
    fs.writeFileSync(
      path.join(docsDir, "policy.md"),
      "# Leave\n\nEmployees receive twenty days of paid vacation per year.\n",
    );
    fs.writeFileSync(
      path.join(docsDir, "notes.html"),
      "<p>Remote work is allowed.</p>",
    );
    run(process.execPath, [binPath, "init", "--no-interactive"], consumerDir);
    run(process.execPath, [binPath, "ingest", "docs"], consumerDir);
    const out = run(
      process.execPath,
      [binPath, "query", "paid vacation days"],
      consumerDir,
    );
    if (!out.includes("docs/policy.md")) {
      throw new Error(`query did not return the indexed document:\n${out}`);
    }
  }),
  check("type declarations compile", () => {
    // Uses the repo's TypeScript and @types/node; the consumer only has
    // production dependencies installed.
    fs.writeFileSync(
      path.join(consumerDir, "check.ts"),
      [
        `import { createRagPipeline, CitationTracker, GuardrailsPipeline } from "${pkgName}";`,
        "const pipeline = createRagPipeline({});",
        "const tracker = new CitationTracker({ similarityThreshold: 0.5 });",
        "const score: number = tracker.track('answer', []).groundednessScore;",
        "new GuardrailsPipeline(pipeline, { strict: true });",
        "export { score };",
      ].join("\n"),
    );
    run(
      process.execPath,
      [
        require.resolve("typescript/bin/tsc", { paths: [root] }),
        "--noEmit",
        "--strict",
        "--module",
        "commonjs",
        "--moduleResolution",
        "node",
        "--esModuleInterop",
        "--typeRoots",
        path.join(root, "node_modules", "@types"),
        "--types",
        "node",
        "check.ts",
      ],
      consumerDir,
    );
  }),
];

if (keep) {
  console.log(`🗂️  Kept ${workDir}`);
} else {
  fs.rmSync(workDir, { recursive: true, force: true });
}

if (results.every(Boolean)) {
  console.log("\n✅ Smoke test passed");
} else {
  console.error("\n❌ Smoke test failed");
  process.exit(1);
}
