/**
 * @devilsdev/rag-mcp-server: check_answer refuses input whose check would
 * take too long (answer words × source clauses, and answer sentences ×
 * source characters), before checking it. Each limit can be changed with a
 * flag, an environment variable or a createServer option.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  StdioClientTransport,
} = require("@modelcontextprotocol/sdk/client/stdio.js");
const { InMemoryTransport } = require("@modelcontextprotocol/sdk/inMemory.js");
const { createServer } = require("../../../packages/rag-mcp-server/lib/server");

const BIN = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "packages",
  "rag-mcp-server",
  "bin",
  "rag-mcp-server.js",
);

jest.setTimeout(60000);

// The suite runs on fake timers; the clock below must be real.
beforeEach(() => jest.useRealTimers());

let docs;

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rag-mcp-clauses-"));
  docs = path.join(tmp, "docs");
  fs.mkdirSync(docs);
  fs.writeFileSync(
    path.join(docs, "vacation.md"),
    "Full-time employees receive twenty days of paid vacation per year.\n",
  );
});

/** A client for an in-memory server made with createServer(index, options). */
async function inMemory(
  options = {},
  index = { size: 0, search: async () => [] },
) {
  const server = createServer(index, options);
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "clause-test", version: "1.0.0" });
  await client.connect(clientSide);
  return client;
}

async function stdio(args, env = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [BIN, docs, ...args],
    env: { ...process.env, ...env },
    stderr: "pipe",
  });
  const client = new Client({ name: "clause-test", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

/** The outcome of a check_answer call as { error: message } or { result }. */
async function call(client, args) {
  try {
    const result = await client.callTool({
      name: "check_answer",
      arguments: args,
    });
    if (result.isError) {
      return { error: result.content.map((c) => c.text).join("\n") };
    }
    return { result };
  } catch (error) {
    return { error: error.message };
  }
}

async function timed(fn) {
  const start = process.hrtime.bigint();
  const value = await fn();
  return { value, ms: Number(process.hrtime.bigint() - start) / 1e6 };
}

describe("default limits", () => {
  let client;
  beforeAll(async () => {
    client = await inMemory();
  });
  afterAll(async () => {
    await client.close();
  });

  // Each of these took seconds to minutes to check before the limits.
  test.each([
    [
      '20 KB of "1," as answer and source',
      "1,".repeat(10000),
      "1,".repeat(10000),
    ],
    [
      'a 50 KB answer and a 200 KB source of "1,"',
      "1,".repeat(24999),
      "1,".repeat(100000),
    ],
    [
      "2,000 short sentences and a 200 KB source of words",
      "cat. ".repeat(2000),
      `cat ${"bb ".repeat(66000)}`,
    ],
  ])("%s is refused quickly", async (_name, answer, source) => {
    const { value, ms } = await timed(() =>
      call(client, { answer, sources: [source] }),
    );
    expect(value.result).toBeUndefined();
    expect(value.error).toMatch(/^Input too large to check: /);
    expect(ms).toBeLessThan(1000);
  });

  test("the clause-pair message gives the counts, the limit and the flag", async () => {
    const { error } = await call(client, {
      answer: "1,".repeat(10000),
      sources: ["1,".repeat(10000)],
    });
    expect(error).toBe(
      "Input too large to check: 10000 answer words × 10000 source clauses exceeds the limit of 2000000. Shorten the answer or sources, or raise --max-clause-pairs.",
    );
  });

  test("the sentence message gives the counts, the limit and the flag", async () => {
    const source = "x".repeat(200000);
    const { error } = await call(client, {
      answer: "cat. ".repeat(20),
      sources: [source],
    });
    expect(error).toBe(
      "Input too large to check: 20 answer sentences × 200000 source characters exceeds the limit of 3000000. Shorten the answer or sources, or raise --max-sentence-source-chars.",
    );
  });

  test("a normal request is still checked", async () => {
    const { result, error } = await call(client, {
      answer:
        "Employees receive twenty days of paid vacation. Unused days can be carried over.",
      sources: [
        "Employees receive twenty days of paid vacation per year. Unused days can be carried over for one year.",
      ],
    });
    expect(error).toBeUndefined();
    expect(result.structuredContent.grounded).toBe(true);
  });

  test("the limits also apply to passages found by search", async () => {
    const passage = {
      id: "p#1",
      source: "p.md",
      score: 1,
      text: "x".repeat(100),
    };
    const c = await inMemory(
      { maxSentenceSourceChars: 150 },
      { size: 1, search: async () => [passage] },
    );
    try {
      expect((await call(c, { answer: "cat." })).error).toBeUndefined();
      expect((await call(c, { answer: "cat. dog." })).error).toMatch(
        /2 answer sentences × 100 source characters exceeds the limit of 150/,
      );
    } finally {
      await c.close();
    }
  });
});

// "a, b, c." has 3 words; "a, b, c, d." has 4 clauses: 12 clause pairs.
// "x one. y two." has 2 sentences; "abcdefghijk" has 11 characters: 22.
const pairs = { answer: "a, b, c.", sources: ["a, b, c, d."] };
const sentences = { answer: "x one. y two.", sources: ["abcdefghijk"] };

describe("changing the limits", () => {
  test("createServer options set both limits", async () => {
    const low = await inMemory({
      maxClausePairs: 11,
      maxSentenceSourceChars: 21,
    });
    const high = await inMemory({
      maxClausePairs: 12,
      maxSentenceSourceChars: 22,
    });
    try {
      expect((await call(low, pairs)).error).toMatch(
        /3 answer words × 4 source clauses exceeds the limit of 11/,
      );
      expect((await call(low, sentences)).error).toMatch(
        /2 answer sentences × 11 source characters exceeds the limit of 21/,
      );
      expect((await call(high, pairs)).error).toBeUndefined();
      expect((await call(high, sentences)).error).toBeUndefined();
    } finally {
      await low.close();
      await high.close();
    }
  });

  test("flags set both limits", async () => {
    const client = await stdio([
      "--max-clause-pairs",
      "11",
      "--max-sentence-source-chars",
      "21",
    ]);
    try {
      expect((await call(client, pairs)).error).toMatch(
        /exceeds the limit of 11\. .*--max-clause-pairs/,
      );
      expect((await call(client, sentences)).error).toMatch(
        /exceeds the limit of 21\. .*--max-sentence-source-chars/,
      );
    } finally {
      await client.close();
    }
  });

  test("environment variables set both limits; a flag wins", async () => {
    const env = {
      RAG_MCP_MAX_CLAUSE_PAIRS: "11",
      RAG_MCP_MAX_SENTENCE_SOURCE_CHARS: "21",
    };
    const client = await stdio([], env);
    try {
      expect((await call(client, pairs)).error).toMatch(/the limit of 11\./);
      expect((await call(client, sentences)).error).toMatch(
        /the limit of 21\./,
      );
    } finally {
      await client.close();
    }
    const flagged = await stdio(
      ["--max-clause-pairs", "12", "--max-sentence-source-chars", "22"],
      env,
    );
    try {
      expect((await call(flagged, pairs)).error).toBeUndefined();
      expect((await call(flagged, sentences)).error).toBeUndefined();
    } finally {
      await flagged.close();
    }
  });

  test.each([
    [["--max-clause-pairs", "0"], {}, /max-clause-pairs/],
    [["--max-sentence-source-chars", "x"], {}, /max-sentence-source-chars/],
    [[], { RAG_MCP_MAX_CLAUSE_PAIRS: "1.5" }, /RAG_MCP_MAX_CLAUSE_PAIRS/],
    [
      [],
      { RAG_MCP_MAX_SENTENCE_SOURCE_CHARS: "-1" },
      /RAG_MCP_MAX_SENTENCE_SOURCE_CHARS/,
    ],
  ])("%j %j is refused at start", (args, env, message) => {
    const run = spawnSync(process.execPath, [BIN, docs, ...args], {
      env: { ...process.env, ...env },
      encoding: "utf8",
      timeout: 30000,
    });
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(message);
  });

  test("--help lists the flags and variables", () => {
    const run = spawnSync(process.execPath, [BIN, "--help"], {
      encoding: "utf8",
    });
    for (const m of [
      "--max-clause-pairs",
      "--max-sentence-source-chars",
      "RAG_MCP_MAX_CLAUSE_PAIRS",
      "RAG_MCP_MAX_SENTENCE_SOURCE_CHARS",
    ]) {
      expect(run.stderr).toContain(m);
    }
  });
});
