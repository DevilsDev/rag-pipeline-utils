/**
 * Time to first token in the CLI, in-process: `query --streaming --trace`
 * and `ai benchmark --streaming` (the e2e suites cover the same commands
 * through the binary).
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { handleQuery } = require("../../../src/cli/handlers/query-handler");
const { handleBenchmark } = require("../../../src/cli/handlers/ai-handler");
const { runBenchmark } = require("../../../src/cli/services/benchmark");
const { loadCliConfig } = require("../../../src/cli/shared/config-context");

const CLI = path.resolve(__dirname, "../../../bin/cli.js");

let dir;
let configPath;

function useLlm(withLlm) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.pipeline = config.pipeline.filter((s) => s.stage !== "llm");
  if (withLlm) {
    config.pipeline.push({ stage: "llm", name: "test" });
    config.plugins = { llm: { test: "./stream-llm.js" } };
  }
  fs.writeFileSync(configPath, JSON.stringify(config));
}

function captureLog(fn) {
  const lines = [];
  const log = jest
    .spyOn(console, "log")
    .mockImplementation((...a) => lines.push(a.join(" ")));
  const write = jest
    .spyOn(process.stdout, "write")
    .mockImplementation(() => true);
  return fn().then(
    () => {
      log.mockRestore();
      write.mockRestore();
      return lines.join("\n");
    },
    (error) => {
      log.mockRestore();
      write.mockRestore();
      throw error;
    },
  );
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-ttft-"));
  fs.mkdirSync(path.join(dir, "docs"));
  fs.writeFileSync(
    path.join(dir, "docs", "vacation.md"),
    "# Vacation\n\nEmployees receive twenty days of paid vacation per year.\n",
  );
  fs.writeFileSync(
    path.join(dir, "docs", "remote.txt"),
    "Remote work is allowed two days per week with manager approval.",
  );
  fs.writeFileSync(
    path.join(dir, "stream-llm.js"),
    "module.exports = class StreamLLM {\n" +
      "  async generate() { return 'Twenty days.'; }\n" +
      "  async *generateStream() {\n" +
      "    await new Promise((r) => setTimeout(r, 20));\n" +
      "    yield { token: 'Twenty ', done: false };\n" +
      "    yield { token: 'days.', done: false };\n" +
      "    yield { token: '', done: true };\n" +
      "  }\n" +
      "};\n",
  );
  for (const args of [
    ["init", "--no-interactive"],
    ["ingest", "docs"],
  ]) {
    const r = spawnSync(process.execPath, [CLI, ...args], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "test" },
    });
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  }
  configPath = path.join(dir, ".ragrc.json");
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
afterEach(() => {
  process.exitCode = undefined;
});

describe("query --streaming --trace", () => {
  test("prints the time to first token with the stage timings", async () => {
    useLlm(true);
    const out = await captureLog(() =>
      handleQuery({ config: configPath }, "paid vacation", {
        streaming: true,
        trace: true,
      }),
    );
    expect(process.exitCode).toBeUndefined();
    const first = Number(out.match(/first token\s+([\d.]+) ms/)[1]);
    const total = Number(out.match(/total\s+([\d.]+) ms/)[1]);
    expect(first).toBeGreaterThanOrEqual(15);
    expect(first).toBeLessThanOrEqual(total);
  });

  test("without streaming there is no first-token line", async () => {
    useLlm(true);
    const out = await captureLog(() =>
      handleQuery({ config: configPath }, "paid vacation", { trace: true }),
    );
    expect(out).toMatch(/total\s+[\d.]+ ms/);
    expect(out).not.toMatch(/first token/);
  });
});

describe("ai benchmark --streaming", () => {
  test("adds first-token percentiles", async () => {
    useLlm(true);
    const { config, configDir } = loadCliConfig({ config: configPath });
    const report = await runBenchmark({
      config,
      configDir,
      runs: 2,
      streaming: true,
    });
    expect(report.streaming).toBe(true);
    const n = report.queries.length * 2;
    expect(report.stages.firstToken.count).toBe(n);
    expect(report.stages.firstToken.min).toBeGreaterThanOrEqual(15);
    expect(report.stages.endToEnd.count).toBe(n);
  });

  test("prints a first-token row", async () => {
    useLlm(true);
    const out = await captureLog(() =>
      handleBenchmark({ config: configPath }, { runs: 1, streaming: true }),
    );
    expect(out).toMatch(/first token \(streamed\)\s+\d+\s+\d+\.\d\d ms/);
    expect(out).toMatch(/end-to-end \(streamed\)/);
  });

  test("without streaming there is no first-token row", async () => {
    useLlm(true);
    const { config, configDir } = loadCliConfig({ config: configPath });
    const report = await runBenchmark({ config, configDir, runs: 1 });
    expect(report.streaming).toBe(false);
    expect(report.stages.firstToken).toBeUndefined();
  });

  test("without an llm stage it says there is nothing to time", async () => {
    useLlm(false);
    const out = await captureLog(() =>
      handleBenchmark({ config: configPath }, { runs: 1, streaming: true }),
    );
    expect(out).toContain("--streaming needs an llm stage");
    expect(out).not.toMatch(/first token/);
  });
});
