/**
 * Runs the real `rag-pipeline` binary end to end in a temp directory:
 * init -> ingest -> query, as separate processes sharing the file-store
 * index. Fully offline: LocalEmbedder plus a test LLM loaded from a
 * `plugins` path in .ragrc.json.
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

function writeDocs(dir) {
  fs.mkdirSync(path.join(dir, "docs", "policies"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "docs", "vacation.md"),
    "# Vacation\n\nEmployees receive twenty days of paid vacation per year.\n",
  );
  fs.writeFileSync(
    path.join(dir, "docs", "policies", "remote.txt"),
    "Remote work is allowed two days per week with manager approval.",
  );
}

function readIndex(dir) {
  return JSON.parse(
    fs.readFileSync(path.join(dir, ".rag", "index.json"), "utf8"),
  );
}

describe("rag-pipeline CLI workflow", () => {
  let dir;

  beforeAll(() => jest.useRealTimers());

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-cli-"));
    writeDocs(dir);
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("init -> ingest -> query retrieves from the persisted index", () => {
    const init = cli(dir, "init", "--no-interactive");
    expect(init.code).toBe(0);
    expect(fs.existsSync(path.join(dir, ".ragrc.json"))).toBe(true);

    const ingest = cli(dir, "ingest", "docs");
    expect(ingest.code).toBe(0);
    expect(ingest.out).toMatch(/Ingested 2 file\(s\), 2 chunk\(s\)/);
    const index = readIndex(dir);
    expect(index.embedder.name).toBe("local");
    expect(Object.keys(index.documents).sort()).toEqual([
      "docs/policies/remote.txt#0",
      "docs/vacation.md#0",
    ]);

    const query = cli(dir, "query", "How many days of paid vacation?");
    expect(query.code).toBe(0);
    expect(query.out).toMatch(/\[1\] docs\/vacation\.md/);
    expect(query.out).not.toMatch(/\bok\b/);
  });

  test("query uses a custom LLM plugin and prints its answer with sources", () => {
    fs.writeFileSync(
      path.join(dir, "echo-llm.js"),
      "module.exports = class EchoLLM {\n" +
        "  async generate(query, docs) {\n" +
        "    return `Answer from ${docs.length} passage(s): ${docs[0].content}`;\n" +
        "  }\n" +
        "};\n",
    );
    expect(cli(dir, "init", "--no-interactive").code).toBe(0);
    const configPath = path.join(dir, ".ragrc.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.pipeline.push({ stage: "llm", name: "echo" });
    config.plugins = { llm: { echo: "./echo-llm.js" } };
    fs.writeFileSync(configPath, JSON.stringify(config));

    expect(cli(dir, "ingest", "docs").code).toBe(0);
    const query = cli(dir, "query", "paid vacation days", "--top-k", "1");

    expect(query.code).toBe(0);
    expect(query.out).toMatch(/Answer from 1 passage\(s\): .*twenty days/s);
    expect(query.out).toMatch(/Sources:/);
  });

  test("re-ingesting a file replaces its chunks instead of duplicating", () => {
    cli(dir, "init", "--no-interactive");
    cli(dir, "ingest", "docs");
    fs.writeFileSync(
      path.join(dir, "docs", "vacation.md"),
      "Employees receive twenty-five days of paid vacation per year.",
    );

    const again = cli(dir, "ingest", "docs/vacation.md");

    expect(again.code).toBe(0);
    const index = readIndex(dir);
    expect(Object.keys(index.documents)).toHaveLength(2);
    expect(index.documents["docs/vacation.md#0"].content).toMatch(
      /twenty-five/,
    );
  });

  test("run --ingest --query does both in one call", () => {
    cli(dir, "init", "--no-interactive");

    const run = cli(dir, "run", "--ingest", "docs", "--query", "remote work");

    expect(run.code).toBe(0);
    expect(run.out).toMatch(/Ingested 2 file/);
    expect(run.out).toMatch(/docs\/policies\/remote\.txt/);
  });

  test("changing the embedder requires --rebuild", () => {
    cli(dir, "init", "--no-interactive");
    cli(dir, "ingest", "docs");
    const index = readIndex(dir);
    index.embedder.name = "openai";
    fs.writeFileSync(
      path.join(dir, ".rag", "index.json"),
      JSON.stringify(index),
    );

    const blocked = cli(dir, "ingest", "docs");
    expect(blocked.code).toBe(1);
    expect(blocked.err).toMatch(/built with embedder "openai".*--rebuild/);

    const rebuilt = cli(dir, "ingest", "docs", "--rebuild");
    expect(rebuilt.code).toBe(0);
    expect(readIndex(dir).embedder.name).toBe("local");
  });

  test.each([
    ["query on an empty index", ["query", "anything"], /index is empty/],
    ["a missing config", ["--config", "nope.json", "query", "x"], /not found/],
    ["a missing input path", ["ingest", "missing-dir"], /Path not found/],
    ["run with nothing to do", ["run"], /Nothing to do/],
  ])("exits 1 with a message for %s", (_label, args, message) => {
    cli(dir, "init", "--no-interactive");

    const result = cli(dir, ...args);

    expect(result.code).toBe(1);
    expect(result.err).toMatch(message);
  });

  test("init refuses to overwrite without --force", () => {
    cli(dir, "init", "--no-interactive");

    const again = cli(dir, "init", "--no-interactive");

    expect(again.code).toBe(1);
    expect(again.err).toMatch(/already exists.*--force/);
    expect(cli(dir, "init", "--no-interactive", "--force").code).toBe(0);
  });

  test("init --template writes the matching pipeline", () => {
    const result = cli(dir, "init", "--no-interactive", "--template", "openai");

    expect(result.code).toBe(0);
    const config = JSON.parse(
      fs.readFileSync(path.join(dir, ".ragrc.json"), "utf8"),
    );
    expect(config.pipeline.map((p) => `${p.stage}:${p.name}`)).toEqual([
      "loader:auto",
      "embedder:openai",
      "retriever:file-store",
      "llm:openai",
    ]);
  });
});

describe("rag-pipeline serve", () => {
  let dir;
  let child;

  beforeAll(() => {
    jest.useRealTimers();
    globalThis.__ALLOW_LOOPBACK_HTTP__ = true; // talks to the server it spawns
  });

  afterAll(() => {
    globalThis.__ALLOW_LOOPBACK_HTTP__ = false;
  });

  afterEach(async () => {
    if (child && child.exitCode === null) {
      // Windows keeps the cwd locked until the process has exited
      await new Promise((resolve) => {
        child.once("exit", resolve);
        child.kill();
      });
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("answers POST /query from the ingested index", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-serve-"));
    writeDocs(dir);
    expect(cli(dir, "init", "--no-interactive").code).toBe(0);
    expect(cli(dir, "ingest", "docs").code).toBe(0);

    const { spawn } = require("child_process");
    child = spawn(process.execPath, [CLI, "serve", "--port", "0"], {
      cwd: dir,
      env: { ...process.env, NODE_ENV: "test" },
    });
    const url = await new Promise((resolve, reject) => {
      let out = "";
      child.stdout.on("data", (d) => {
        out += d;
        const match = out.match(/at (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) resolve(match[1]);
      });
      child.on("exit", (code) => reject(new Error(`serve exited ${code}`)));
    });

    const { httpRequest } = require("../utils/http-request");
    const health = await httpRequest(`${url}/health`);
    expect(health.status).toBe(200);

    const res = await httpRequest(`${url}/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "paid vacation days", topK: 1 }),
    });
    const { body } = res;

    expect(res.status).toBe(200);
    expect(body.answer).toBeNull();
    expect(body.results[0].metadata.source).toBe("docs/vacation.md");
  });
});

describe("rag-pipeline query options", () => {
  let dir;
  const ANSWER =
    "Employees receive twenty days of paid vacation per year. The office is in Paris.";

  beforeAll(() => jest.useRealTimers());

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-cli-opts-"));
    writeDocs(dir);
    fs.writeFileSync(
      path.join(dir, "stream-llm.js"),
      `const ANSWER = ${JSON.stringify(ANSWER)};\n` +
        "module.exports = class StreamLLM {\n" +
        "  async generate() { return ANSWER; }\n" +
        "  async *generateStream() {\n" +
        "    for (const w of ANSWER.split(/(?<= )/)) yield { token: w, done: false };\n" +
        "    yield { token: '', done: true };\n" +
        "  }\n" +
        "};\n",
    );
    fs.writeFileSync(
      path.join(dir, "slow-llm.js"),
      "module.exports = class SlowLLM {\n" +
        "  async generate(q, d, { signal } = {}) {\n" +
        "    await new Promise((resolve, reject) => {\n" +
        "      const t = setTimeout(resolve, 10000);\n" +
        "      if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); });\n" +
        "    });\n" +
        "    return 'too late';\n" +
        "  }\n" +
        "};\n",
    );
    expect(cli(dir, "init", "--no-interactive").code).toBe(0);
    expect(cli(dir, "ingest", "docs").code).toBe(0);
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function useLlm(file, model) {
    const configPath = path.join(dir, ".ragrc.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.pipeline.push({
      stage: "llm",
      name: "test",
      ...(model && { config: { model } }),
    });
    config.plugins = { llm: { test: `./${file}` } };
    fs.writeFileSync(configPath, JSON.stringify(config));
  }

  test("--trace shows per-stage timings", () => {
    const q = cli(dir, "query", "paid vacation days", "--trace");
    expect(q.code).toBe(0);
    expect(q.out).toMatch(
      /Trace\n\s+embed\s+[\d.]+ ms\n\s+retrieve\s+[\d.]+ ms/,
    );
    expect(q.out).toMatch(/total\s+[\d.]+ ms/);
  });

  test("--explain flags the unsupported sentence; --stats prices the model", () => {
    useLlm("stream-llm.js", "gpt-4o-mini");
    const q = cli(
      dir,
      "query",
      "paid vacation days",
      "--top-k",
      "1",
      "--explain",
      "--stats",
    );
    expect(q.code).toBe(0);
    expect(q.out).toMatch(/"The office is in Paris\."\n\s+-> not supported/);
    expect(q.out).toMatch(/Groundedness: 0\.50/);
    expect(q.out).toMatch(/cost\s+~\$[\d.]+ \(gpt-4o-mini, estimated\)/);
  });

  test("--streaming prints the streamed answer and the sources", () => {
    useLlm("stream-llm.js");
    const q = cli(
      dir,
      "query",
      "paid vacation days",
      "--streaming",
      "--top-k",
      "1",
    );
    expect(q.code).toBe(0);
    expect(q.out.startsWith(ANSWER)).toBe(true);
    expect(q.out).toMatch(/Sources:\n\n\[1\] docs\/vacation\.md/);
  });

  test("--streaming --trace shows time to first token", () => {
    useLlm("stream-llm.js");
    const q = cli(dir, "query", "paid vacation days", "--streaming", "--trace");
    expect(q.code).toBe(0);
    const first = Number(q.out.match(/first token\s+([\d.]+) ms/)[1]);
    const total = Number(q.out.match(/total\s+([\d.]+) ms/)[1]);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(total);

    const plain = cli(dir, "query", "paid vacation days", "--trace");
    expect(plain.out).not.toMatch(/first token/);
  });

  test("--timeout aborts a slow llm and exits 1", () => {
    useLlm("slow-llm.js");
    const started = Date.now();
    const q = cli(dir, "query", "vacation", "--timeout", "300");
    expect(q.code).toBe(1);
    expect(q.err).toMatch(/Execution timeout/);
    expect(Date.now() - started).toBeLessThan(9000);
  });

  test("--quiet prints only the answer; --json includes the trace", () => {
    useLlm("stream-llm.js");
    const quiet = cli(dir, "--quiet", "query", "paid vacation days");
    expect(quiet.code).toBe(0);
    expect(quiet.out.trim()).toBe(ANSWER);

    const json = cli(
      dir,
      "query",
      "paid vacation days",
      "--json",
      "--trace",
      "--stats",
    );
    const parsed = JSON.parse(json.out);
    expect(parsed.answer).toBe(ANSWER);
    expect(Object.keys(parsed.trace.stages)).toEqual(
      expect.arrayContaining(["embed", "retrieve", "generate"]),
    );
    expect(parsed.stats.passages).toBeGreaterThan(0);
    expect(parsed).not.toHaveProperty("timings");
  });
});
