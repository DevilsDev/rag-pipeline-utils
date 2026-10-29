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

/** Run node with args; return stdout and stderr (throws on non-zero exit). */
function runCapture(args, cwd) {
  const { spawnSync } = require("child_process");
  const result = spawnSync(process.execPath, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    const error = new Error(result.stderr || `exit ${result.status}`);
    error.stderr = result.stderr;
    throw error;
  }
  return { stdout: result.stdout, stderr: result.stderr };
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
  // --ignore-scripts above hides install-time scripts, so check for them:
  // a postinstall that calls a dev tool (husky) makes `npm install` fail
  // for everyone who doesn't have that tool installed globally.
  check("no install-time scripts run in users' projects", () => {
    const installed = require(
      path.join(consumerDir, "node_modules", pkgName, "package.json"),
    );
    const found = ["preinstall", "install", "postinstall"].filter(
      (name) => installed.scripts && installed.scripts[name],
    );
    if (found.length > 0) {
      throw new Error(
        `the package runs ${found.map((n) => `"${n}": "${installed.scripts[n]}"`).join(", ")} on install`,
      );
    }
  }),
  check("require() loads with no console output or warnings", () => {
    const { stdout, stderr } = runCapture(
      [
        "-e",
        `const m=require('${pkgName}');` +
          "if(typeof m.createRagPipeline!=='function')throw new Error('createRagPipeline missing');",
      ],
      consumerDir,
    );
    if (stdout.trim() || stderr.trim()) {
      throw new Error(`unexpected output:\n${stdout}${stderr}`);
    }
  }),
  check(
    "experimental entry: require/import, one class copy, one warning",
    () => {
      const script = [
        `const main = require('${pkgName}');`,
        `const exp = require('${pkgName}/experimental');`,
        "if (typeof exp.TenantManager !== 'function') throw new Error('missing TenantManager');",
        "new exp.TenantManager();", // no warning from the experimental entry
        "const a = new main.TenantManager();",
        "new main.TenantManager();",
        "if (!(a instanceof exp.TenantManager)) throw new Error('two copies of the class');",
        `import('${pkgName}/experimental').then((esm) => {`,
        "  if (esm.TenantManager !== exp.TenantManager) throw new Error('ESM/CJS mismatch');",
        "});",
      ].join("\n");
      const { stderr } = runCapture(["-e", script], consumerDir);
      const warnings = stderr.match(/RAG_DEP_TENANT_MANAGER/g) || [];
      if (warnings.length !== 1) {
        throw new Error(`expected exactly one deprecation warning:\n${stderr}`);
      }
    },
  ),
  check("testing entry: require/import, shares the main classes", () => {
    const script = [
      `const main = require('${pkgName}');`,
      `const testing = require('${pkgName}/testing');`,
      "testing.createTestPipeline().then(async ({ pipeline, retriever, llm }) => {",
      "  if (!(retriever instanceof main.MemoryRetriever)) throw new Error('two copies of MemoryRetriever');",
      "  const r = await pipeline.run({ query: 'How many vacation days?' });",
      "  if (r.results[0].id !== 'vacation' || llm.calls.length !== 1) throw new Error('unexpected result');",
      `  const esm = await import('${pkgName}/testing');`,
      "  if (esm.EchoLLM !== testing.EchoLLM) throw new Error('ESM/CJS mismatch');",
      "}).catch((e) => { console.error(e); process.exit(1); });",
    ].join("\n");
    const { stdout, stderr } = runCapture(["-e", script], consumerDir);
    if (stdout.trim() || stderr.trim()) {
      throw new Error(`unexpected output:\n${stdout}${stderr}`);
    }
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
      "ai",
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
        `import { MemoryCache, RedisCache } from "${pkgName}";`,
        "const cached = createRagPipeline({ cache: { embeddings: new MemoryCache({ maxEntries: 10 }), generation: true } });",
        "const stats = cached.cacheStats();",
        "void RedisCache; void stats;",
        `import { TenantManager, SSOManager } from "${pkgName}/experimental";`,
        `import { createTestPipeline, EchoLLM } from "${pkgName}/testing";`,
        "const echo: InstanceType<typeof EchoLLM> = new EchoLLM({ answer: 'x' });",
        "void createTestPipeline({ llm: echo });",
        "const tenants: typeof TenantManager = TenantManager;",
        "let sso: InstanceType<typeof SSOManager> | undefined;",
        "export { score, tenants, sso };",
      ].join("\n"),
    );
    // "node" resolution reads typesVersions; "node16" reads the exports map
    for (const [moduleKind, resolution] of [
      ["commonjs", "node"],
      ["node16", "node16"],
    ]) {
      run(
        process.execPath,
        [
          require.resolve("typescript/bin/tsc", { paths: [root] }),
          "--noEmit",
          "--strict",
          "--module",
          moduleKind,
          "--moduleResolution",
          resolution,
          "--esModuleInterop",
          "--typeRoots",
          path.join(root, "node_modules", "@types"),
          "--types",
          "node",
          "check.ts",
        ],
        consumerDir,
      );
    }
  }),
  check("plugins written to the declared contracts work", () => {
    // Each component is typed only by the published interfaces. If the
    // declarations drift from what createRagPipeline calls, either this
    // stops compiling or the assertions below fail.
    fs.writeFileSync(
      path.join(consumerDir, "contracts.ts"),
      `
import {
  createRagPipeline, logger,
  type EmbedderPlugin, type RetrieverPlugin, type RerankerPlugin,
  type LLMPlugin, type PipelineRunResult, type SearchResult,
} from "${pkgName}";

const docs: SearchResult[] = [
  { id: "a", score: 0.9, content: "Employees get 25 paid vacation days." },
  { id: "b", score: 0.5, content: "The office opens at 9." },
];
const calls: string[] = [];
const embedder: EmbedderPlugin = {
  embed(text) { calls.push("embed:" + text); return [1, 0]; },
};
const retriever: RetrieverPlugin = {
  retrieve({ query, queryVector, topK }) {
    calls.push("retrieve:" + query + ":" + (queryVector || []).join(",") + ":" + topK);
    return docs.slice(0, topK);
  },
};
const reranker: RerankerPlugin = {
  rerank(query, documents) { calls.push("rerank:" + query); return [...documents].reverse(); },
};
const llm: LLMPlugin = {
  generate(query, documents) { return query + " -> " + documents.map((d) => d.id).join(","); },
};

async function main(): Promise<void> {
  const pipeline = createRagPipeline({ embedder, retriever, reranker, llm });
  const result = (await pipeline.run({ query: "vacation", options: { topK: 2 } })) as PipelineRunResult;
  const expected = ["embed:vacation", "retrieve:vacation:1,0:2", "rerank:vacation"];
  if (!result.success) throw new Error("run failed: " + result.error);
  if (result.answer !== "vacation -> b,a") throw new Error("answer: " + result.answer);
  if (calls.join("|") !== expected.join("|")) throw new Error("calls: " + calls.join("|"));
  logger.debug("contracts ok");
}
main().catch((error) => { console.error(error); process.exit(1); });
`,
    );
    run(
      process.execPath,
      [
        require.resolve("typescript/bin/tsc", { paths: [root] }),
        "--strict",
        "--module",
        "node16",
        "--moduleResolution",
        "node16",
        "--typeRoots",
        path.join(root, "node_modules", "@types"),
        "--types",
        "node",
        "--outDir",
        "out",
        "contracts.ts",
      ],
      consumerDir,
    );
    run(process.execPath, [path.join("out", "contracts.js")], consumerDir);
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
