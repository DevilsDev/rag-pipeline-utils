/**
 * Runs `rag-pipeline eval` end to end in a temp directory: init, ingest,
 * then eval against the persisted index. Fully offline: LocalEmbedder plus
 * a test LLM plugin whose answer can be overridden with EVAL_ANSWER, so a
 * second run can be made worse than the saved baseline.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CLI = path.resolve(__dirname, "../../bin/cli.js");

function cli(cwd, args, env = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test", ...env },
  });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

const write = (dir, file, content) =>
  fs.writeFileSync(
    path.join(dir, file),
    typeof content === "string" ? content : JSON.stringify(content, null, 2),
  );

const DATASET = [
  {
    id: "vacation",
    prompt: "How many days of paid vacation do employees get?",
    expected: "Employees receive twenty days of paid vacation per year.",
    sourceIds: ["docs/vacation.md"],
  },
  {
    id: "remote",
    prompt: "How many days per week is remote work allowed?",
    sourceIds: ["docs/remote.txt"],
  },
];

describe("rag-pipeline eval", () => {
  let dir;

  beforeAll(() => jest.useRealTimers());

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-eval-"));
    fs.mkdirSync(path.join(dir, "docs"));
    write(
      dir,
      "docs/vacation.md",
      "# Vacation\n\nEmployees receive twenty days of paid vacation per year.\n",
    );
    write(
      dir,
      "docs/remote.txt",
      "Remote work is allowed two days per week with manager approval.",
    );
    expect(cli(dir, ["init", "--no-interactive"]).code).toBe(0);
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function addLlm() {
    write(
      dir,
      "echo-llm.js",
      "module.exports = class EchoLLM {\n" +
        "  async generate(query, docs) {\n" +
        "    return process.env.EVAL_ANSWER || docs[0].content;\n" +
        "  }\n" +
        "};\n",
    );
    const configPath = path.join(dir, ".ragrc.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.pipeline.push({ stage: "llm", name: "echo" });
    config.plugins = { llm: { echo: "./echo-llm.js" } };
    fs.writeFileSync(configPath, JSON.stringify(config));
  }

  test("retrieval only: scores source recall and applies --min", () => {
    expect(cli(dir, ["ingest", "docs"]).code).toBe(0);
    write(
      dir,
      "tests.jsonl",
      DATASET.map((c) => JSON.stringify(c)).join("\n") + "\n",
    );

    const run = cli(dir, ["eval", "tests.jsonl", "--output", "main.json"]);
    expect(run.code).toBe(0);
    expect(run.out).toMatch(/2 cases, 0 failed/);
    expect(run.out).toMatch(/sourceRecall\s+1\.000/);
    expect(run.out).toMatch(/Evaluation passed/);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, "main.json")));
    expect(saved.summary.metrics.sourceRecall).toEqual({ mean: 1, count: 2 });
    expect(saved.cases[0].retrievedIds[0]).toBe("docs/vacation.md#0");

    const strict = cli(dir, [
      "eval",
      "tests.jsonl",
      "--min",
      "faithfulness=0.5",
      "--json",
    ]);
    expect(strict.code).toBe(1);
    const verdict = JSON.parse(strict.out);
    expect(verdict.passed).toBe(false);
    expect(verdict.reasons).toEqual([
      "Faithfulness was not measured (minimum 0.5)",
    ]);
  });

  test("fails a run that regressed from the baseline and writes the summary", () => {
    addLlm();
    expect(cli(dir, ["ingest", "docs"]).code).toBe(0);
    write(dir, "tests.json", { cases: DATASET });

    const base = cli(dir, ["eval", "tests.json", "--output", "main.json"]);
    expect(base.code).toBe(0);
    expect(base.out).toMatch(/faithfulness\s+1\.000/);

    const worse = cli(
      dir,
      [
        "eval",
        "tests.json",
        "--baseline",
        "main.json",
        "--report",
        "summary.md",
      ],
      { EVAL_ANSWER: "The office is in Paris." },
    );
    expect(worse.code).toBe(1);
    expect(worse.out).toMatch(
      /faithfulness\s+0\.000\s+\(baseline 1\.000, -1\.000, regressed\)/,
    );
    expect(worse.out).toMatch(/Cases that got worse:/);
    expect(worse.out).toMatch(/Faithfulness dropped -1\.000 from the baseline/);

    const summary = fs.readFileSync(path.join(dir, "summary.md"), "utf8");
    expect(summary).toMatch(/^<!-- rag-eval-report -->/);
    expect(summary).toMatch(/### RAG evaluation: ❌ Failed/);
    expect(summary).toMatch(
      /\| Faithfulness \| 0\.000 \| 1\.000 \| -1\.000 ⚠️ \|/,
    );

    const html = cli(dir, [
      "eval",
      "tests.json",
      "--baseline",
      "main.json",
      "--report",
      "report.html",
    ]);
    expect(html.code).toBe(0);
    const page = fs.readFileSync(path.join(dir, "report.html"), "utf8");
    expect(page).toMatch(/^<!doctype html>/);
    expect(page).toMatch(/>Passed</);
  });

  test("rejects an invalid dataset before running anything", () => {
    write(dir, "bad.json", [{ prompt: "ok" }, { expected: "no prompt" }]);
    const run = cli(dir, ["eval", "bad.json"]);
    expect(run.code).toBe(1);
    expect(run.err).toMatch(/Invalid dataset bad\.json/);
    expect(run.err).toMatch(/Case 2: missing "prompt"/);

    const badMin = cli(dir, ["eval", "bad.json", "--min", "speed=0.5"]);
    expect(badMin.code).not.toBe(0);
    expect(badMin.err).toMatch(/Unknown metric "speed"/);
  });
});
