#!/usr/bin/env node
/**
 * Bug hunt 4: docs claims (benchmarks/fixtures/bug-hunt-plan.md).
 *
 *   node benchmarks/bug-hunt/docs-claims.js generate --cap=<usd>
 *   node benchmarks/bug-hunt/docs-claims.js run
 *
 * For each docs-site page (not the generated api/ pages or the Changelog,
 * which is generated from CHANGELOG.md) and the README, claude-sonnet-5-5
 * lists every checkable behavioural claim and writes an offline Jest test
 * for it against this repository's source. The tests are written to the
 * gitignored benchmarks/.data/docs-claims/ and run there; every failure is
 * triaged by hand as a code bug, a docs bug or a wrong generated test.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { ClaudeCache } = require("../claude-cache");
const { args } = require("../claude-common");
const { liveAnthropic } = require("../../__tests__/live/live-env.js");

const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(ROOT, "benchmarks", ".data", "docs-claims");
const DOCS = path.join(ROOT, "docs-site", "docs");

function pages() {
  return [
    ...fs
      .readdirSync(DOCS)
      .filter((f) => /\.mdx?$/.test(f) && f !== "Changelog.md")
      .map((f) => path.join("docs-site", "docs", f)),
    "README.md",
  ];
}

function exportsList() {
  const names = (p) => Object.keys(require(path.join(ROOT, p))).join(", ");
  return [
    `Main entry ("@devilsdev/rag-pipeline-utils", load with require(ROOT + "/src/index.js")): ${names("src/index.js")}`,
    `"/testing" (require(ROOT + "/src/testing.js")): ${names("src/testing.js")}`,
    `"/edge" (require(ROOT + "/src/edge.js")): ${names("src/edge.js")}`,
  ].join("\n");
}

const PROMPT = (
  page,
  text,
  exportsText,
) => `You check that a library's documentation is true. Below is one documentation page of rag-pipeline-utils (a Node.js RAG library), and the names the library exports.

Task: pick the CHECKABLE BEHAVIOURAL claims on the page, at most 12, the most specific first: something the code does that a test can verify offline and deterministically (a default value, an error or error code, a returned field, "X never happens", "Y is reported as Z", an option's effect). Skip claims that need network access, an API key, a real model, external services, timing/benchmark numbers, or are about the project rather than the code.

Write ONE Jest test file (CommonJS) with one test per claim. Name each test "c<N>: <the claim in a few words>", and put the page's sentence it checks in a comment above it. Rules:
- Start with: const ROOT = process.env.REPO_ROOT; and load the library only as require(ROOT + "/src/index.js"), require(ROOT + "/src/testing.js") or require(ROOT + "/src/edge.js").
- Offline only: no network, no API keys. For a pipeline, use the /testing helpers (createTestPipeline, EchoLLM, HashEmbedder, fixtures) or LocalEmbedder and MemoryRetriever.
- Test what the page says, exactly; do not invent behaviour the page doesn't state. If the page's own example shows an output, assert that output.
- Each test must be independent; use temporary directories (fs.mkdtempSync(os.tmpdir())) for files.

Reply with ONLY the test file, in one \`\`\`js code block.

Exports:
${exportsText}

Page: ${page}
${text}`;

async function generate() {
  const cap = Number(args.cap);
  if (!Number.isFinite(cap)) throw new Error("--cap=<usd> is required");
  const cache = new ClaudeCache({
    apiKey: liveAnthropic().apiKey,
    capUSD: cap,
  });
  fs.mkdirSync(OUT, { recursive: true });
  const exportsText = exportsList();
  const { mapLimit } = require("../claude-common");
  const index = await mapLimit(pages(), 4, async (page) => {
    const text = fs.readFileSync(path.join(ROOT, page), "utf8");
    let r;
    try {
      r = await cache.messages({
        model: "claude-sonnet-5-5",
        max_tokens: 10000,
        // no extended thinking: an earlier run spent the whole budget thinking
        // and wrote no answer (the model rejects "disabled")
        thinking: { type: "between_tools" },
        messages: [{ role: "user", content: PROMPT(page, text, exportsText) }],
      });
    } catch (e) {
      console.error(`${page}: ${e.message}`);
      return { page, error: e.message };
    }
    const raw = (r.data.content || []).map((b) => b.text || "").join("");
    const m = raw.match(/```(?:js|javascript)?\s*\n([\s\S]*?)```/);
    if (!m) {
      console.error(`${page}: no code block (stop: ${r.data.stop_reason})`);
      return { page, error: `no code block (stop: ${r.data.stop_reason})` };
    }
    const name = page.replace(/[\\/]/g, "__").replace(/\.mdx?$/, "");
    fs.writeFileSync(path.join(OUT, `${name}.test.js`), m[1]);
    const claims = [...m[1].matchAll(/\btest\(\s*["'`](c\d+:[^"'`]*)/g)].map(
      (x) => ({ id: x[1].split(":")[0], claim: x[1] }),
    );
    console.log(`${page}: ${claims.length} claims`);
    return { page, testFile: `${name}.test.js`, claims };
  });
  fs.writeFileSync(
    path.join(OUT, "index.json"),
    JSON.stringify(index, null, 2),
  );
  console.log(`cache spend now US$${cache.spentUSD().toFixed(4)} (cap ${cap})`);
}

function run() {
  const config = path.join(OUT, "jest.config.js");
  fs.writeFileSync(
    config,
    `module.exports = { rootDir: ${JSON.stringify(OUT)}, testMatch: ["**/*.test.js"], testEnvironment: "node", setupFilesAfterEnv: [${JSON.stringify(path.join(ROOT, "jest.setup.js"))}], testTimeout: 30000 };\n`,
  );
  const jsonOut = path.join(OUT, "results.json");
  try {
    execFileSync(
      process.execPath,
      [
        require.resolve("jest/bin/jest"),
        "--config",
        config,
        "--json",
        `--outputFile=${jsonOut}`,
        "--silent",
      ],
      {
        cwd: ROOT,
        env: { ...process.env, REPO_ROOT: ROOT },
        stdio: "ignore",
      },
    );
  } catch {
    /* failures are expected; the JSON has them */
  }
  const results = JSON.parse(fs.readFileSync(jsonOut, "utf8"));
  const index = JSON.parse(
    fs.readFileSync(path.join(OUT, "index.json"), "utf8"),
  );
  const perPage = {};
  for (const file of results.testResults) {
    const name = path.basename(file.name);
    const page = (index.find((p) => p.testFile === name) || {}).page || name;
    const row = (perPage[page] ||= {
      claims: 0,
      passed: 0,
      failed: 0,
      suiteError: null,
      failures: [],
    });
    if (file.assertionResults.length === 0 && file.message)
      row.suiteError = file.message.slice(0, 400);
    for (const a of file.assertionResults) {
      if (a.status === "passed") row.passed++;
      else if (a.status === "failed") {
        row.failed++;
        row.failures.push({
          test: a.title,
          message: (a.failureMessages || []).join("\n").slice(0, 600),
        });
      }
    }
  }
  for (const p of index) {
    const row = (perPage[p.page] ||= {
      claims: 0,
      passed: 0,
      failed: 0,
      suiteError: null,
      failures: [],
    });
    row.claims = (p.claims || []).length;
    if (p.error) row.suiteError = p.error;
  }
  fs.writeFileSync(
    path.join(OUT, "per-page.json"),
    JSON.stringify(perPage, null, 2),
  );
  let claims = 0,
    passed = 0,
    failed = 0;
  for (const [page, r] of Object.entries(perPage)) {
    claims += r.claims;
    passed += r.passed;
    failed += r.failed;
    console.log(
      `${page.padEnd(48)} claims ${String(r.claims).padStart(3)}  pass ${String(r.passed).padStart(3)}  fail ${String(r.failed).padStart(3)}${r.suiteError ? "  SUITE ERROR" : ""}`,
    );
  }
  console.log(
    `total claims ${claims}, tests passed ${passed}, failed ${failed}`,
  );
}

const cmd = process.argv[2];
(cmd === "generate"
  ? generate()
  : cmd === "run"
    ? Promise.resolve(run())
    : Promise.reject(new Error("usage: generate|run"))
).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
