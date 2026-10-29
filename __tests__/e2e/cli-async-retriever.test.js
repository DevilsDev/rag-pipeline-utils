/**
 * The CLI with a retriever whose methods are all async, like a remote
 * vector store (pgvector, Qdrant): ingest (including re-ingesting a file),
 * query, eval and generate-dataset must await it. The store keeps its data
 * in a JSON file so separate CLI processes share it, and it can't save
 * embedder state, so the fitted `local` embedder must be refused.
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

const STORE = `const fs = require("fs");
const path = require("path");
const later = (value) => new Promise((r) => setTimeout(() => r(value), 5));
module.exports = class AsyncStore {
  constructor() { this.file = path.join(__dirname, "async-store.json"); }
  read() { return fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, "utf8")) : {}; }
  write(docs) { fs.writeFileSync(this.file, JSON.stringify(docs)); }
  async store(vectors) {
    const docs = this.read();
    for (const v of vectors) docs[v.id] = { content: v.content, metadata: v.metadata, vector: v.vector };
    await later(); this.write(docs);
  }
  async removeBySource(source) {
    const docs = this.read();
    for (const [id, d] of Object.entries(docs)) if (d.metadata && d.metadata.source === source) delete docs[id];
    await later(); this.write(docs);
  }
  async clear() { await later(); this.write({}); }
  async size() { return later(Object.keys(this.read()).length); }
  async list() { return later(Object.entries(this.read()).map(([id, d]) => ({ id, content: d.content, metadata: d.metadata }))); }
  async retrieve({ queryVector, topK = 3 }) {
    const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
    const scored = Object.entries(this.read()).map(([id, d]) => ({ id, content: d.content, metadata: d.metadata, score: dot(queryVector, d.vector) }));
    return later(scored.sort((a, b) => b.score - a.score).slice(0, topK));
  }
};
`;

const EMBEDDER = `module.exports = class WordEmbedder {
  async embed(text) {
    const v = new Array(64).fill(0);
    for (const w of String(text).toLowerCase().match(/[a-z]+/g) || []) {
      let h = 0; for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      v[h % 64] += 1;
    }
    const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / n);
  }
};
`;

const LLM = `module.exports = class WriterLLM {
  async generate(query, docs) {
    const text = docs[0] ? docs[0].content : "";
    if (/^Write \\d+ question/.test(query)) {
      return JSON.stringify([{ question: "What does the policy on " + text.split(/\\s+/)[0].toLowerCase() + " say?", answer: text.split(/(?<=\\.)\\s/)[0] }]);
    }
    return text;
  }
};
`;

describe("CLI with an async retriever", () => {
  let dir;

  beforeAll(() => jest.useRealTimers());

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-async-"));
    fs.mkdirSync(path.join(dir, "docs"));
    fs.writeFileSync(
      path.join(dir, "docs", "vacation.md"),
      "Vacation: full-time employees receive twenty days of paid vacation per year. Unused days carry over.\n",
    );
    fs.writeFileSync(
      path.join(dir, "docs", "remote.md"),
      "Remote work is allowed up to three days a week with approval from a manager. Core hours apply.\n",
    );
    fs.writeFileSync(path.join(dir, "async-store.js"), STORE);
    fs.writeFileSync(path.join(dir, "word-embedder.js"), EMBEDDER);
    fs.writeFileSync(path.join(dir, "writer-llm.js"), LLM);
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function writeConfig(embedder) {
    fs.writeFileSync(
      path.join(dir, ".ragrc.json"),
      JSON.stringify({
        pipeline: [
          { stage: "loader", name: "auto" },
          { stage: "embedder", name: embedder },
          { stage: "retriever", name: "async" },
          { stage: "llm", name: "writer" },
        ],
        plugins: {
          embedder: { words: "./word-embedder.js" },
          retriever: { async: "./async-store.js" },
          llm: { writer: "./writer-llm.js" },
        },
      }),
    );
  }

  const stored = () =>
    JSON.parse(fs.readFileSync(path.join(dir, "async-store.json"), "utf8"));

  test("ingest, re-ingest, query, generate-dataset and eval await the store", () => {
    writeConfig("words");
    const first = cli(dir, ["ingest", "docs"]);
    expect(first.err).toBe("");
    expect(first.code).toBe(0);
    expect(first.out).toMatch(/Index now holds 2 chunk\(s\)/);

    // Re-ingesting replaces the file's chunks: removeBySource is awaited.
    fs.writeFileSync(
      path.join(dir, "docs", "vacation.md"),
      "Vacation: full-time employees receive twenty-five days of paid vacation per year. Unused days carry over.\n",
    );
    const again = cli(dir, ["ingest", "docs/vacation.md"]);
    expect(again.code).toBe(0);
    expect(again.out).toMatch(/Index now holds 2 chunk\(s\)/);
    expect(Object.keys(stored()).sort()).toEqual([
      "docs/remote.md#0",
      "docs/vacation.md#0",
    ]);
    expect(stored()["docs/vacation.md#0"].content).toMatch(/twenty-five/);

    const query = cli(dir, ["query", "How many days of paid vacation?"]);
    expect(query.code).toBe(0);
    expect(query.out).toMatch(/twenty-five days/);

    const gen = cli(dir, ["generate-dataset", "--output", "tests.json"]);
    expect(gen.err).toBe("");
    expect(gen.code).toBe(0);
    expect(gen.out).toMatch(/Wrote 2 cases/);

    const run = cli(dir, ["eval", "tests.json", "--min", "sourceRecall=1"]);
    expect(run.code).toBe(0);
    expect(run.out).toMatch(/sourceRecall\s+1\.000/);
  });

  test("refuses the fitted local embedder with a store that can't save it", () => {
    writeConfig("local");
    const ingest = cli(dir, ["ingest", "docs"]);
    expect(ingest.code).toBe(1);
    expect(ingest.err).toMatch(
      /The "local" embedder is fitted to your documents and needs a retriever that saves its state/,
    );
    expect(fs.existsSync(path.join(dir, "async-store.json"))).toBe(false);
  });
});
