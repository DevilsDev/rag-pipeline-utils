/**
 * Runs `rag-pipeline generate-dataset` end to end: ingest, generate a test
 * set from the index with an offline llm plugin, then `eval` that set.
 * The plugin writes one pair per chunk from the chunk's first sentence when
 * asked for questions, and answers with the top passage otherwise.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CLI = path.resolve(__dirname, "../../bin/cli.js");

function cli(cwd, args) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test" },
  });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

const LLM = `module.exports = class WriterLLM {
  async generate(query, docs) {
    const text = docs[0] ? docs[0].content : "";
    if (/^Write \\d+ question/.test(query)) {
      const first = text.split(/(?<=\\.)\\s/)[0];
      const topic = text.split(/\\s+/)[0].toLowerCase();
      return JSON.stringify([{ question: "What is the policy on " + topic + "?", answer: first }]);
    }
    return text;
  }
};
`;

describe("rag-pipeline generate-dataset", () => {
  let dir;

  beforeAll(() => jest.useRealTimers());

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-gen-"));
    fs.mkdirSync(path.join(dir, "docs"));
    fs.writeFileSync(
      path.join(dir, "docs", "vacation.md"),
      "Vacation: full-time employees receive twenty days of paid vacation per year. Unused days carry over.\n",
    );
    fs.writeFileSync(
      path.join(dir, "docs", "remote.md"),
      "Remote work is allowed up to three days a week with approval from a manager. Core hours apply.\n",
    );
    fs.writeFileSync(path.join(dir, "short.md"), "Too short.\n");
    expect(cli(dir, ["init", "--no-interactive"]).code).toBe(0);
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function addLlm() {
    fs.writeFileSync(path.join(dir, "writer-llm.js"), LLM);
    const configPath = path.join(dir, ".ragrc.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.pipeline.push({ stage: "llm", name: "writer" });
    config.plugins = { llm: { writer: "./writer-llm.js" } };
    fs.writeFileSync(configPath, JSON.stringify(config));
  }

  test("writes a reviewable test set that eval can run", () => {
    addLlm();
    expect(cli(dir, ["ingest", "docs"]).code).toBe(0);
    expect(cli(dir, ["ingest", "short.md"]).code).toBe(0);

    const gen = cli(dir, ["generate-dataset", "--output", "tests.json"]);
    expect(gen.err).toBe("");
    expect(gen.code).toBe(0);
    expect(gen.out).toMatch(/Skipped:\n {2}1 × shorter than 80 characters/);
    expect(gen.out).toMatch(/Wrote 2 cases to tests\.json/);

    const cases = JSON.parse(fs.readFileSync(path.join(dir, "tests.json")));
    expect(cases.map((c) => c.sourceIds[0]).sort()).toEqual([
      "docs/remote.md",
      "docs/vacation.md",
    ]);
    expect(cases[0]).toMatchObject({
      tags: ["synthetic"],
      reviewed: false,
    });

    const run = cli(dir, ["eval", "tests.json", "--min", "sourceRecall=1"]);
    expect(run.code).toBe(0);
    expect(run.out).toMatch(/sourceRecall\s+1\.000/);
  });

  test("does not overwrite a test set without --force", () => {
    addLlm();
    expect(cli(dir, ["ingest", "docs"]).code).toBe(0);
    fs.writeFileSync(path.join(dir, "tests.json"), "[]");

    const refused = cli(dir, ["generate-dataset", "--output", "tests.json"]);
    expect(refused.code).toBe(1);
    expect(refused.err).toMatch(/already exists\. Pass --force/);
    expect(fs.readFileSync(path.join(dir, "tests.json"), "utf8")).toBe("[]");

    const forced = cli(dir, [
      "generate-dataset",
      "--output",
      "tests.json",
      "--count",
      "1",
      "--force",
    ]);
    expect(forced.code).toBe(0);
    expect(
      JSON.parse(fs.readFileSync(path.join(dir, "tests.json"))),
    ).toHaveLength(1);
  });

  test("needs an llm stage", () => {
    expect(cli(dir, ["ingest", "docs"]).code).toBe(0);
    const run = cli(dir, ["generate-dataset", "--output", "tests.json"]);
    expect(run.code).toBe(1);
    expect(run.err).toMatch(/needs an llm stage/);
  });
});
