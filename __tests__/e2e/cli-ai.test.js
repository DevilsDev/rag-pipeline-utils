/**
 * Runs the real `rag-pipeline ai ...` commands end to end in a temp
 * directory against a file-store index built by `init` + `ingest`.
 * Fully offline (LocalEmbedder, no llm).
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CLI = path.resolve(__dirname, "../../bin/cli.js");

function cli(cwd, ...args) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test" },
  });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

function write(dir, rel, text) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
}

function readJson(dir, rel) {
  return JSON.parse(fs.readFileSync(path.join(dir, rel), "utf8"));
}

function setup(dir) {
  write(
    dir,
    "docs/vacation.md",
    "# Vacation\n\nEmployees receive twenty days of paid vacation per year.\n",
  );
  write(
    dir,
    "docs/leave.txt",
    "Paid parental leave is sixteen weeks. Vacation days do not apply.",
  );
  write(
    dir,
    "docs/remote.txt",
    "Remote work is allowed two days per week with manager approval.",
  );
  expect(cli(dir, "init", "--no-interactive").code).toBe(0);
  expect(cli(dir, "ingest", "docs").code).toBe(0);
}

describe("rag-pipeline ai", () => {
  let dir;

  beforeAll(() => jest.useRealTimers());

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-ai-"));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("ai --help lists only the real subcommands", () => {
    const help = cli(dir, "ai", "--help");
    expect(help.code).toBe(0);
    for (const name of [
      "train",
      "benchmark",
      "feedback",
      "search",
      "multimodal",
    ]) {
      expect(help.out).toContain(name);
    }
    expect(help.out).not.toMatch(/federat|dashboard|profile|fine-tun/i);
  });

  describe("train embedding", () => {
    test("refits on the index, re-embeds it and queries still work", () => {
      setup(dir);
      const before = readJson(dir, ".rag/index.json");

      const train = cli(dir, "ai", "train", "embedding");

      expect(train.code).toBe(0);
      const vocab = before.embedder.state.vocabulary.length;
      expect(train.out).toContain("on 3 indexed chunk(s)");
      expect(train.out).toContain(`Vocabulary: ${vocab} term(s)`);
      expect(train.out).toContain("Re-embedded 3 indexed chunk(s)");
      const after = readJson(dir, ".rag/index.json");
      expect(after.embedder.dimensions).toBe(vocab);

      const query = cli(dir, "query", "paid vacation days");
      expect(query.code).toBe(0);
      expect(query.out).toMatch(/\[1\] docs\/vacation\.md/);
    });

    test("trains on [path] and reports the new vocabulary", () => {
      setup(dir);
      write(dir, "corpus/a.txt", "Remote work policy. Remote days per week.");

      const train = cli(dir, "ai", "train", "embedding", "corpus");

      expect(train.code).toBe(0);
      expect(train.out).toContain("read from corpus");
      const index = readJson(dir, ".rag/index.json");
      const terms = index.embedder.state.vocabulary.map(([t]) => t);
      expect(terms.sort()).toEqual(
        ["days", "per", "policy", "remote", "week", "work"].sort(),
      );
      expect(train.out).toContain(`Vocabulary: ${terms.length} term(s)`);
      expect(index.embedder.dimensions).toBe(terms.length);
    });

    test("fails with exit 1 when the embedder is not local", () => {
      write(
        dir,
        "fixed-embedder.js",
        "module.exports = class Fixed { embed() { return [1, 0]; } };\n",
      );
      expect(cli(dir, "init", "--no-interactive").code).toBe(0);
      const config = readJson(dir, ".ragrc.json");
      config.pipeline = config.pipeline.map((e) =>
        e.stage === "embedder" ? { stage: "embedder", name: "fixed" } : e,
      );
      config.plugins = { embedder: { fixed: "./fixed-embedder.js" } };
      fs.writeFileSync(path.join(dir, ".ragrc.json"), JSON.stringify(config));

      const train = cli(dir, "ai", "train", "embedding");

      expect(train.code).toBe(1);
      expect(train.err).toMatch(/only supported for the built-in "local"/);
      expect(train.err).toContain('uses "fixed"');
    });

    test("explains hosted embedders cannot be trained, even without an API key", () => {
      const init = cli(dir, "init", "--no-interactive", "--template", "openai");
      expect(init.code).toBe(0);

      const train = cli(dir, "ai", "train", "embedding");

      expect(train.code).toBe(1);
      expect(train.err).toMatch(/only supported for the built-in "local"/);
      expect(train.err).toContain('uses "openai"');
    });

    test("fails with exit 1 on an empty index", () => {
      expect(cli(dir, "init", "--no-interactive").code).toBe(0);
      const train = cli(dir, "ai", "train", "embedding");
      expect(train.code).toBe(1);
      expect(train.err).toMatch(/index is empty/);
    });
  });

  describe("feedback and search", () => {
    test("up votes move a chunk to the top with an explained adjustment", () => {
      setup(dir);
      const question = "paid vacation days";
      const first = cli(dir, "ai", "search", question, "--json");
      expect(first.code).toBe(0);
      const baseline = JSON.parse(first.out).results;
      expect(baseline[0].id).toBe("docs/vacation.md#0");
      expect(baseline[1].id).toBe("docs/leave.txt#0");
      expect(baseline.every((r) => r.adjustment === 0)).toBe(true);

      for (let i = 0; i < 2; i++) {
        const vote = cli(
          dir,
          "ai",
          "feedback",
          question,
          "docs/leave.txt#0",
          "--rating",
          "up",
        );
        expect(vote.code).toBe(0);
      }
      const stored = readJson(dir, ".rag/feedback.json");
      expect(stored.entries).toHaveLength(2);
      expect(stored.entries[0]).toMatchObject({
        question,
        docId: "docs/leave.txt#0",
        rating: "up",
      });

      const after = JSON.parse(
        cli(dir, "ai", "search", question, "--json").out,
      ).results;
      const leave = after.find((r) => r.id === "docs/leave.txt#0");
      expect(leave.adjustment).toBeCloseTo(0.2, 10);
      expect(leave.finalScore).toBeCloseTo(baseline[1].score + 0.2, 10);
      expect(after[0].id).toBe("docs/leave.txt#0");

      const text = cli(dir, "ai", "search", question);
      expect(text.code).toBe(0);
      expect(text.out).toMatch(
        /up vote on "paid vacation days" \(term overlap 1\.00\): \+0\.100/,
      );
    });

    test("rejects unknown chunk ids and invalid ratings with exit 1", () => {
      setup(dir);
      const unknown = cli(
        dir,
        "ai",
        "feedback",
        "q",
        "nope#0",
        "--rating",
        "up",
      );
      expect(unknown.code).toBe(1);
      expect(unknown.err).toMatch(/No indexed chunk with id "nope#0"/);

      const bad = cli(
        dir,
        "ai",
        "feedback",
        "q",
        "docs/leave.txt#0",
        "--rating",
        "meh",
      );
      expect(bad.code).toBe(1);
      expect(bad.err).toMatch(/Allowed choices are up, down/);

      const missing = cli(dir, "ai", "feedback", "q", "docs/leave.txt#0");
      expect(missing.code).toBe(1);
      expect(fs.existsSync(path.join(dir, ".rag", "feedback.json"))).toBe(
        false,
      );
    });

    test("a corrupt feedback file is an error, not silently replaced", () => {
      setup(dir);
      write(dir, ".rag/feedback.json", "{not json");
      const search = cli(dir, "ai", "search", "vacation");
      expect(search.code).toBe(1);
      expect(search.err).toMatch(/not valid JSON/);
    });
  });

  describe("benchmark", () => {
    test("reports measured latencies for sampled queries", () => {
      setup(dir);
      const bench = cli(dir, "ai", "benchmark", "--runs", "2", "--json");

      expect(bench.code).toBe(0);
      const report = JSON.parse(bench.out);
      expect(report.queries).toHaveLength(3);
      expect(report.queriesSource).toBe("sampled from indexed chunks");
      for (const stage of ["embed", "retrieve", "endToEnd"]) {
        const s = report.stages[stage];
        expect(s.count).toBe(6);
        expect(s.p50).toBeGreaterThanOrEqual(0);
        expect(s.p95).toBeGreaterThanOrEqual(s.p50);
        expect(s.max).toBeGreaterThanOrEqual(s.p95);
      }
      expect(report.stages.rerank).toBeUndefined();
      expect(report.includesGeneration).toBe(false);
      expect(report.environment).toMatchObject({
        node: process.version,
        chunks: 3,
        embedder: "local",
        retriever: "file-store",
        llm: null,
      });
    });

    test("reads queries from a file and prints a table", () => {
      setup(dir);
      write(dir, "queries.txt", "paid vacation\n\nremote work\n");
      const bench = cli(
        dir,
        "ai",
        "benchmark",
        "--queries",
        "queries.txt",
        "--runs",
        "1",
      );

      expect(bench.code).toBe(0);
      expect(bench.out).toContain("2 queries (queries.txt) x 1 run(s)");
      expect(bench.out).toMatch(/end-to-end\s+2\s+\d+\.\d\d ms/);
      expect(bench.out).toContain(`Node ${process.version}`);
    });

    test("fails with exit 1 for a missing queries file", () => {
      setup(dir);
      const bench = cli(dir, "ai", "benchmark", "--queries", "missing.txt");
      expect(bench.code).toBe(1);
      expect(bench.err).toMatch(/Queries file not found/);
    });
  });

  describe("multimodal process", () => {
    test("reports type, characters and chunks for text files", () => {
      write(dir, "a.md", "# Title\n\nSome text here.\n");
      const run = cli(dir, "ai", "multimodal", "process", "a.md", "--json");
      expect(run.code).toBe(0);
      const report = JSON.parse(run.out);
      expect(report.processed).toEqual([
        expect.objectContaining({
          source: "a.md",
          type: "markdown",
          characters: 25,
          chunks: 1,
        }),
      ]);
      expect(fs.existsSync(path.join(dir, ".rag"))).toBe(false);
    });

    test("images exit 1 explaining a vision model is required", () => {
      write(dir, "photo.png", "not really a png");
      const run = cli(dir, "ai", "multimodal", "process", "photo.png");
      expect(run.code).toBe(1);
      expect(run.err).toMatch(/needs a vision-capable model/);
      expect(run.out).toBe("");
    });

    test("directories process text files and list skipped images", () => {
      write(dir, "in/a.txt", "Hello world.");
      write(dir, "in/b.jpg", "x");
      const run = cli(dir, "ai", "multimodal", "process", "in");
      expect(run.code).toBe(0);
      expect(run.out).toMatch(/in\/a\.txt: text, 12 characters, 1 chunk/);
      expect(run.out).toMatch(/skipped in\/b\.jpg: image/);
    });
  });
});
