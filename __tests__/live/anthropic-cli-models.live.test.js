"use strict";

/**
 * The CLI with Claude, and every current Claude model through the
 * connector and the cost tables: npm run test:live (see live-env.js).
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { liveAnthropic } = require("./live-env");
const {
  AnthropicConnector,
} = require("../../src/connectors/anthropic-connector");
const { CostCalculator } = require("../../src/cost/cost-calculator");

const { apiKey, reason } = liveAnthropic();
const describeLive = apiKey ? describe : describe.skip;
if (!apiKey) {
  // eslint-disable-next-line no-console
  console.warn(`Skipping live Claude CLI and model tests: ${reason}`);
}

jest.setTimeout(180000);

const CLI = path.resolve(__dirname, "../../bin/cli.js");
const cli = (cwd, args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ANTHROPIC_API_KEY: apiKey },
    timeout: 170000,
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

describeLive("the CLI with Claude, live", () => {
  let dir;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-live-cli-"));
    fs.mkdirSync(path.join(dir, "docs"));
    fs.writeFileSync(
      path.join(dir, "docs", "vacation.md"),
      "# Vacation\n\nFull-time employees receive twenty days of paid vacation per year. Unused days can be carried over for up to twelve months.\n",
    );
    fs.writeFileSync(
      path.join(dir, "docs", "remote.md"),
      "# Remote work\n\nRemote work is allowed two days per week with manager approval. Employees must be reachable from 10:00 to 15:00.\n",
    );
  });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("init --template anthropic, ingest and query answer from the documents", () => {
    expect(
      cli(dir, ["init", "--template", "anthropic", "--no-interactive"]).code,
    ).toBe(0);
    expect(cli(dir, ["ingest", "docs"]).code).toBe(0);
    const q = cli(dir, ["query", "How many vacation days do employees get?"]);
    expect(q.code).toBe(0);
    expect(q.out.toLowerCase()).toMatch(/twenty|20/);
  });

  test("eval scores Claude's answers and gates on a minimum", () => {
    fs.writeFileSync(
      path.join(dir, "tests.json"),
      JSON.stringify([
        {
          id: "vacation",
          prompt: "How many days of paid vacation do employees get?",
          sourceIds: ["docs/vacation.md"],
        },
        {
          id: "remote",
          prompt: "How many days per week is remote work allowed?",
          sourceIds: ["docs/remote.md"],
        },
      ]),
    );
    const r = cli(dir, [
      "eval",
      "tests.json",
      "--min",
      "sourceRecall=0.5",
      "--json",
    ]);
    const verdict = JSON.parse(r.out);
    expect(verdict.summary.cases).toBe(2);
    expect(verdict.summary.failed).toBe(0);
    expect(verdict.summary.metrics.faithfulness.mean).toBeGreaterThan(0);
    expect(r.code).toBe(verdict.passed ? 0 : 1);
  });

  test("generate-dataset writes questions about the index with Claude", () => {
    const r = cli(dir, [
      "generate-dataset",
      "--output",
      "generated.json",
      "--count",
      "2",
      "--min-faithfulness",
      "0.5",
    ]);
    expect(r.code).toBe(0);
    const cases = JSON.parse(
      fs.readFileSync(path.join(dir, "generated.json"), "utf8"),
    );
    const list = Array.isArray(cases) ? cases : cases.cases;
    expect(list.length).toBeGreaterThan(0);
    expect(typeof list[0].prompt).toBe("string");
  });
});

// The models this key can use, as listed by /v1/models on 2026-11-05
const MODELS = [
  "claude-haiku-5-5",
  "claude-haiku-4-5-20251001",
  "claude-sonnet-5-5",
  "claude-opus-5-5",
  "claude-fable-5-1",
];

describeLive("every current Claude model, live", () => {
  test.each(MODELS)(
    "%s answers through AnthropicConnector and has a price",
    async (model) => {
      const answer = await new AnthropicConnector({
        apiKey,
        model,
        maxTokens: 50,
      }).generate("Reply with the single word: ready", []);
      expect(answer.toLowerCase()).toContain("ready");
      const calculator = new CostCalculator();
      calculator.on("warning", () => {});
      // A million tokens each way, at the published price
      expect(calculator.estimate(model, 1e6, 1e6).totalCost).toBeGreaterThan(0);
    },
  );
});
