/**
 * @devilsdev/rag-mcp-server: check_answer bounds the text it accepts
 * (answer 50,000 characters, each source 200,000 by default), with an
 * environment variable and a command-line flag to change either bound.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  StdioClientTransport,
} = require("@modelcontextprotocol/sdk/client/stdio.js");

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

let docs;

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rag-mcp-caps-"));
  docs = path.join(tmp, "docs");
  fs.mkdirSync(docs);
  fs.writeFileSync(
    path.join(docs, "vacation.md"),
    "Full-time employees receive twenty days of paid vacation per year.\n",
  );
});

async function connect(args, env = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [BIN, docs, ...args],
    env: { ...process.env, ...env },
    stderr: "pipe",
  });
  const client = new Client({ name: "caps-test", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

/** The outcome of a call as { error: message } or { result }. */
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

const sentence = "Employees receive twenty days of paid vacation per year. ";
const text = (length) =>
  sentence.repeat(Math.ceil(length / 56)).slice(0, length);

describe("default limits", () => {
  let client;
  beforeAll(async () => {
    client = await connect([]);
  });
  afterAll(async () => {
    await client.close();
  });

  test("an answer of 50,000 characters is accepted", async () => {
    const { error } = await call(client, {
      answer: text(50000),
      sources: ["Employees receive twenty days of paid vacation per year."],
    });
    expect(error).toBeUndefined();
  });

  test("an answer of 50,001 characters is refused with a clear message", async () => {
    const { result, error } = await call(client, {
      answer: text(50001),
      sources: ["a source"],
    });
    expect(result).toBeUndefined();
    expect(error).toMatch(/answer is too long/);
    expect(error).toMatch(/50000/);
    expect(error).toMatch(/--max-answer-chars/);
    expect(error).toMatch(/RAG_MCP_MAX_ANSWER_CHARS/);
  });

  test("a source of 200,001 characters is refused, as a string or as { text }", async () => {
    for (const source of [text(200001), { id: "s1", text: text(200001) }]) {
      const { result, error } = await call(client, {
        answer: "Employees receive twenty days of paid vacation.",
        sources: [source],
      });
      expect(result).toBeUndefined();
      expect(error).toMatch(/source text is too long/);
      expect(error).toMatch(/200000/);
      expect(error).toMatch(/--max-source-chars/);
      expect(error).toMatch(/RAG_MCP_MAX_SOURCE_CHARS/);
    }
  });

  test("a source of 200,000 characters is accepted", async () => {
    const { error } = await call(client, {
      answer: "Employees receive twenty days of paid vacation.",
      sources: [text(200000)],
    });
    expect(error).toBeUndefined();
  });

  test("the tool schema states the answer limit", async () => {
    const { tools } = await client.listTools();
    const check = tools.find((t) => t.name === "check_answer");
    expect(check.inputSchema.properties.answer.maxLength).toBe(50000);
  });
});

describe("changing the limits", () => {
  test("flags set both limits", async () => {
    const client = await connect([
      "--max-answer-chars",
      "100",
      "--max-source-chars",
      "300",
    ]);
    try {
      expect(
        (await call(client, { answer: text(101), sources: ["s"] })).error,
      ).toMatch(/at most 100 characters/);
      expect(
        (await call(client, { answer: text(100), sources: [text(300)] })).error,
      ).toBeUndefined();
      expect(
        (await call(client, { answer: "ok answer", sources: [text(301)] }))
          .error,
      ).toMatch(/at most 300 characters/);
    } finally {
      await client.close();
    }
  });

  test("environment variables set both limits", async () => {
    const client = await connect([], {
      RAG_MCP_MAX_ANSWER_CHARS: "80",
      RAG_MCP_MAX_SOURCE_CHARS: "90",
    });
    try {
      expect(
        (await call(client, { answer: text(81), sources: ["s"] })).error,
      ).toMatch(/at most 80 characters/);
      expect(
        (await call(client, { answer: "ok answer", sources: [text(91)] }))
          .error,
      ).toMatch(/at most 90 characters/);
    } finally {
      await client.close();
    }
  });

  test("a flag wins over the environment variable", async () => {
    const client = await connect(["--max-answer-chars", "60"], {
      RAG_MCP_MAX_ANSWER_CHARS: "10",
    });
    try {
      expect(
        (await call(client, { answer: text(60), sources: ["s"] })).error,
      ).toBeUndefined();
      expect(
        (await call(client, { answer: text(61), sources: ["s"] })).error,
      ).toMatch(/at most 60 characters/);
    } finally {
      await client.close();
    }
  });

  test.each([
    [["--max-answer-chars", "0"], {}, /max-answer-chars/],
    [["--max-source-chars", "abc"], {}, /max-source-chars/],
    [["--max-answer-chars", "1.5"], {}, /max-answer-chars/],
    [[], { RAG_MCP_MAX_SOURCE_CHARS: "-3" }, /RAG_MCP_MAX_SOURCE_CHARS/],
  ])("%j %j is refused at start", (args, env, message) => {
    const run = spawnSync(process.execPath, [BIN, docs, ...args], {
      env: { ...process.env, ...env },
      encoding: "utf8",
      timeout: 30000,
    });
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(message);
  });

  test("--help lists both flags and variables", () => {
    const run = spawnSync(process.execPath, [BIN, "--help"], {
      encoding: "utf8",
    });
    expect(run.stderr).toMatch(/--max-answer-chars/);
    expect(run.stderr).toMatch(/--max-source-chars/);
    expect(run.stderr).toMatch(/RAG_MCP_MAX_ANSWER_CHARS/);
    expect(run.stderr).toMatch(/RAG_MCP_MAX_SOURCE_CHARS/);
  });
});

async function callTool(client, name, args) {
  try {
    const result = await client.callTool({ name, arguments: args });
    if (result.isError) {
      return { error: result.content.map((c) => c.text).join("\n") };
    }
    return { result };
  } catch (error) {
    return { error: error.message };
  }
}

describe("question, query and source-count limits", () => {
  let client;
  beforeAll(async () => {
    client = await connect([]);
  });
  afterAll(async () => {
    await client.close();
  });

  const answer = "Employees receive twenty days of paid vacation.";

  test("a question of 10,000 characters is accepted, 10,001 is refused", async () => {
    expect(
      (await call(client, { answer, question: text(10000), sources: ["s"] }))
        .error,
    ).toBeUndefined();
    const { result, error } = await call(client, {
      answer,
      question: text(10001),
      sources: ["s"],
    });
    expect(result).toBeUndefined();
    expect(error).toMatch(/question is too long/);
    expect(error).toMatch(/10000/);
    expect(error).toMatch(/--max-question-chars/);
    expect(error).toMatch(/RAG_MCP_MAX_QUESTION_CHARS/);
  });

  test("the question limit also applies when sources are omitted", async () => {
    const { error } = await call(client, { answer, question: text(10001) });
    expect(error).toMatch(/question is too long/);
  });

  test("a search_documents query of 10,001 characters is refused", async () => {
    expect(
      (await callTool(client, "search_documents", { query: text(10000) }))
        .error,
    ).toBeUndefined();
    const { result, error } = await callTool(client, "search_documents", {
      query: text(10001),
    });
    expect(result).toBeUndefined();
    expect(error).toMatch(/query is too long/);
    expect(error).toMatch(/--max-question-chars/);
  });

  test("100 sources are accepted, 101 are refused", async () => {
    const many = (n) => Array.from({ length: n }, (_, i) => `source ${i}`);
    expect(
      (await call(client, { answer, sources: many(100) })).error,
    ).toBeUndefined();
    const { result, error } = await call(client, {
      answer,
      sources: many(101),
    });
    expect(result).toBeUndefined();
    expect(error).toMatch(/too many sources/);
    expect(error).toMatch(/at most 100/);
    expect(error).toMatch(/--max-sources/);
    expect(error).toMatch(/RAG_MCP_MAX_SOURCES/);
  });

  test("the tool schemas state the limits", async () => {
    const { tools } = await client.listTools();
    const check = tools.find((t) => t.name === "check_answer");
    const search = tools.find((t) => t.name === "search_documents");
    expect(check.inputSchema.properties.question.maxLength).toBe(10000);
    expect(check.inputSchema.properties.sources.maxItems).toBe(100);
    expect(search.inputSchema.properties.query.maxLength).toBe(10000);
  });

  test("flags override both limits", async () => {
    const c = await connect([
      "--max-question-chars",
      "50",
      "--max-sources",
      "2",
    ]);
    try {
      expect(
        (await call(c, { answer, question: text(50), sources: ["a", "b"] }))
          .error,
      ).toBeUndefined();
      expect(
        (await call(c, { answer, question: text(51), sources: ["a"] })).error,
      ).toMatch(/at most 50 characters/);
      expect(
        (await call(c, { answer, sources: ["a", "b", "c"] })).error,
      ).toMatch(/at most 2 are accepted/);
      expect(
        (await callTool(c, "search_documents", { query: text(51) })).error,
      ).toMatch(/at most 50 characters/);
    } finally {
      await c.close();
    }
  });

  test("environment variables override both limits; a flag wins", async () => {
    const env = {
      RAG_MCP_MAX_QUESTION_CHARS: "40",
      RAG_MCP_MAX_SOURCES: "1",
    };
    const c = await connect([], env);
    try {
      expect(
        (await call(c, { answer, question: text(41), sources: ["a"] })).error,
      ).toMatch(/at most 40 characters/);
      expect((await call(c, { answer, sources: ["a", "b"] })).error).toMatch(
        /at most 1 are accepted/,
      );
    } finally {
      await c.close();
    }
    const f = await connect(["--max-sources", "3"], env);
    try {
      expect(
        (await call(f, { answer, sources: ["a", "b", "c"] })).error,
      ).toBeUndefined();
    } finally {
      await f.close();
    }
  });

  test.each([
    [["--max-question-chars", "0"], {}, /max-question-chars/],
    [["--max-sources", "x"], {}, /max-sources/],
    [[], { RAG_MCP_MAX_SOURCES: "0" }, /RAG_MCP_MAX_SOURCES/],
    [[], { RAG_MCP_MAX_QUESTION_CHARS: "1.5" }, /RAG_MCP_MAX_QUESTION_CHARS/],
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
      "--max-question-chars",
      "--max-sources",
      "RAG_MCP_MAX_QUESTION_CHARS",
      "RAG_MCP_MAX_SOURCES",
    ]) {
      expect(run.stderr).toContain(m);
    }
  });

  test("createServer accepts maxQuestionChars and maxSources", () => {
    const {
      createServer,
    } = require("../../../packages/rag-mcp-server/lib/server");
    expect(() =>
      createServer(
        { search: async () => [], size: 0 },
        { maxQuestionChars: 5, maxSources: 1 },
      ),
    ).not.toThrow();
  });
});
