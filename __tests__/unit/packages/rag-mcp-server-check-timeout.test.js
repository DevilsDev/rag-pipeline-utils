/**
 * @devilsdev/rag-mcp-server: check_answer runs checkAnswer in a worker
 * thread and stops a check that runs past --check-timeout-ms
 * (RAG_MCP_CHECK_TIMEOUT_MS, createServer's checkTimeoutMs; default 10,000).
 * At most --max-concurrent-checks checks run at once (default 2), and up to
 * 8 more wait.
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
const {
  createCheckRunner,
  CheckTimeoutError,
} = require("../../../packages/rag-mcp-server/lib/check-runner");
const { checkAnswer } = require("../../../packages/rag-mcp-server/lib/library");

const PKG = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "packages",
  "rag-mcp-server",
);
const BIN = path.join(PKG, "bin", "rag-mcp-server.js");
const FIXTURES = path.join(
  __dirname,
  "..",
  "..",
  "fixtures",
  "mcp-check-worker",
);

jest.setTimeout(60000);

// The suite runs on fake timers; the time limit needs real ones.
beforeEach(() => jest.useRealTimers());

let docs;

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rag-mcp-timeout-"));
  docs = path.join(tmp, "docs");
  fs.mkdirSync(docs);
  fs.writeFileSync(
    path.join(docs, "vacation.md"),
    "Full-time employees receive twenty days of paid vacation per year.\n",
  );
});

const quantities = (n) => `Staff carry ${"5 kg ".repeat(n).trim()}.`;
// About 200,000 characters of "5 kg": every claim quantity is compared with
// every source quantity. Within both work limits.
const QUANTITY_SOURCE = quantities(39995);
// Takes a few seconds to check: well past the short limits below.
const slow = { answer: quantities(500), sources: [QUANTITY_SOURCE] };

async function inMemory(
  options = {},
  index = { size: 0, search: async () => [] },
) {
  const server = createServer(index, options);
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "timeout-test", version: "1.0.0" });
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
  const client = new Client({ name: "timeout-test", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

async function call(client, name, args) {
  try {
    const result = await client.callTool({ name, arguments: args }, undefined, {
      timeout: 120000,
    });
    if (result.isError) {
      return { error: result.content.map((c) => c.text).join("\n") };
    }
    return { result };
  } catch (error) {
    return { error: error.message };
  }
}
const check = (client, args) => call(client, "check_answer", args);

const stopped = (ms) =>
  `check_answer took longer than ${ms} ms and was stopped. Shorten the answer or sources, or raise --check-timeout-ms.`;

describe("the time limit", () => {
  test('10,000 "5 kg" against 15 sources is stopped at the default 10,000 ms, within 1 s', async () => {
    const input = {
      answer: quantities(9990),
      sources: Array(15).fill(QUANTITY_SOURCE),
    };
    // What this machine spends outside the limit (counting the input,
    // starting a worker, copying the input to it): the same call stopped
    // after 1 ms
    const probe = await inMemory({ checkTimeoutMs: 1 });
    let overhead;
    try {
      const start = Date.now();
      expect((await check(probe, input)).error).toBe(stopped(1));
      overhead = Date.now() - start;
    } finally {
      await probe.close();
    }
    const client = await inMemory();
    try {
      const start = Date.now();
      const { result, error } = await check(client, input);
      const ms = Date.now() - start;
      expect(result).toBeUndefined();
      expect(error).toBe(stopped(10000));
      expect(ms).toBeGreaterThanOrEqual(10000);
      expect(ms).toBeLessThan(10000 + overhead + 1000);
    } finally {
      await client.close();
    }
  });

  test("a normal check gives the same result as calling checkAnswer", async () => {
    const answer =
      "Employees receive twenty days of paid vacation. Contractors receive thirty days.";
    const sources = [
      "Employees receive twenty days of paid vacation per year.",
      { id: "c", text: "Contractors do not receive paid vacation." },
    ];
    const client = await inMemory();
    try {
      const { result, error } = await check(client, { answer, sources });
      expect(error).toBeUndefined();
      const direct = await checkAnswer({
        answer,
        sources: [
          { id: "1", content: sources[0] },
          { id: "c", content: sources[1].text },
        ],
        evaluate: false,
      });
      expect(result.structuredContent).toEqual({
        grounded: direct.grounded,
        groundedness: Number(direct.groundedness.toFixed(4)),
        unsupported: direct.unsupported,
        citations: direct.citations.map((c) => ({
          sentence: c.sentence,
          sources: c.sources.map((s) => String(s.docId)),
        })),
        sources: [{ id: "1" }, { id: "c" }],
      });
      expect(direct.unsupported).toEqual(["Contractors receive thirty days."]);
    } finally {
      await client.close();
    }
  });

  test("the runner returns exactly what checkAnswer returns", async () => {
    const runner = createCheckRunner({ timeoutMs: 10000 });
    const params = {
      answer: "Cats sleep 16 hours a day. Dogs never sleep.",
      sources: [{ id: "a", content: "Cats sleep 16 hours a day. Dogs sleep." }],
      evaluate: false,
    };
    try {
      expect(await runner.run(params)).toEqual(await checkAnswer(params));
    } finally {
      await runner.close();
    }
  });

  test("an error thrown by checkAnswer is returned, and the worker is kept", async () => {
    const runner = createCheckRunner({ timeoutMs: 10000 });
    try {
      await expect(runner.run({ answer: 42 })).rejects.toThrow(
        "answer must be a string",
      );
      const ok = await runner.run({ answer: "Hi.", sources: ["Hi."] });
      expect(ok.grounded).toBe(true);
    } finally {
      await runner.close();
    }
  });
});

describe("changing the time limit", () => {
  test("createServer's checkTimeoutMs sets it", async () => {
    const client = await inMemory({ checkTimeoutMs: 250 });
    try {
      expect((await check(client, slow)).error).toBe(stopped(250));
    } finally {
      await client.close();
    }
  });

  test("--check-timeout-ms sets it", async () => {
    const client = await stdio(["--check-timeout-ms", "200"]);
    try {
      expect((await check(client, slow)).error).toBe(stopped(200));
    } finally {
      await client.close();
    }
  });

  test("RAG_MCP_CHECK_TIMEOUT_MS sets it; the flag wins", async () => {
    const env = { RAG_MCP_CHECK_TIMEOUT_MS: "300" };
    const client = await stdio([], env);
    try {
      expect((await check(client, slow)).error).toBe(stopped(300));
    } finally {
      await client.close();
    }
    const flagged = await stdio(["--check-timeout-ms", "400"], env);
    try {
      expect((await check(flagged, slow)).error).toBe(stopped(400));
    } finally {
      await flagged.close();
    }
  });

  test.each([
    [["--check-timeout-ms", "0"], {}, /check-timeout-ms/],
    [[], { RAG_MCP_CHECK_TIMEOUT_MS: "fast" }, /RAG_MCP_CHECK_TIMEOUT_MS/],
  ])("%j %j is refused at start", (args, env, message) => {
    const run = spawnSync(process.execPath, [BIN, docs, ...args], {
      env: { ...process.env, ...env },
      encoding: "utf8",
      timeout: 30000,
    });
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(message);
  });

  test("--help lists the flag and variable", () => {
    const run = spawnSync(process.execPath, [BIN, "--help"], {
      encoding: "utf8",
    });
    expect(run.stderr).toContain("--check-timeout-ms");
    expect(run.stderr).toContain("RAG_MCP_CHECK_TIMEOUT_MS");
  });
});

describe("worker failures", () => {
  test.each([
    [
      "throws an uncaught error",
      "crash.js",
      /stopped unexpectedly: worker crashed on purpose/,
    ],
    [
      "exits without replying",
      "exit.js",
      /stopped unexpectedly \(exit code 3\)/,
    ],
  ])(
    "a worker that %s gives an error, not a hang",
    async (_k, file, message) => {
      const runner = createCheckRunner({
        timeoutMs: 30000,
        file: path.join(FIXTURES, file),
      });
      try {
        const start = Date.now();
        await expect(
          runner.run({ answer: "a", sources: ["a"] }),
        ).rejects.toThrow(message);
        expect(Date.now() - start).toBeLessThan(5000);
        // A new worker replaces the failed one
        await expect(
          runner.run({ answer: "a", sources: ["a"] }),
        ).rejects.toThrow(message);
      } finally {
        await runner.close();
      }
    },
  );

  test("running out of memory during a check gives an error, not a hang", async () => {
    // 16 MB is enough to load the library and run a small check, and far
    // too little to check against 30 distinct 200 KB sources (6 MB of text,
    // which completes with the default 512 MB). 15 identical sources needed
    // about 16 MB and sometimes fit.
    const runner = createCheckRunner({
      timeoutMs: 30000,
      resourceLimits: { maxOldGenerationSizeMb: 16 },
    });
    const big = {
      answer: "cat bb.",
      sources: Array.from(
        { length: 30 },
        (_, i) => `cat ${i} ${"bb ".repeat(66000)}`,
      ),
      evaluate: false,
    };
    try {
      expect((await runner.run({ answer: "a", sources: ["a"] })).grounded).toBe(
        true,
      );
      await expect(runner.run(big)).rejects.toThrow(
        /stopped unexpectedly: .*memory limit/,
      );
    } finally {
      await runner.close();
    }
  });

  test("a stopped check is reported as a CheckTimeoutError", async () => {
    const runner = createCheckRunner({ timeoutMs: 100 });
    try {
      await expect(runner.run(slow)).rejects.toBeInstanceOf(CheckTimeoutError);
      // The next check runs in a fresh worker
      const ok = await runner.run({ answer: "Hi.", sources: ["Hi."] });
      expect(ok.grounded).toBe(true);
    } finally {
      await runner.close();
    }
  });
});

const queueFull = "Too many check_answer calls waiting; try again shortly.";

/** Send `n` slow checks at once; the error texts, in the order sent. */
async function burst(client, n) {
  const results = await Promise.all(
    Array.from({ length: n }, () => check(client, slow)),
  );
  return results.map((r) => r.error);
}

describe("concurrent checks", () => {
  test("5 parallel slow checks never use more than 2 workers at once, and all finish", async () => {
    const runner = createCheckRunner({
      timeoutMs: 60000,
      file: path.join(FIXTURES, "timed-check.js"),
    });
    try {
      const checks = await Promise.all(
        Array.from({ length: 5 }, () => runner.run(slow)),
      );
      expect(checks).toHaveLength(5);
      for (const c of checks) expect(typeof c.grounded).toBe("boolean");
      expect(new Set(checks.map((c) => c.threadId)).size).toBeLessThanOrEqual(
        2,
      );
      // Most checks running at the same moment
      const overlap = Math.max(
        ...checks.map(
          (c) =>
            checks.filter(
              (o) => o.startedAt <= c.startedAt && c.startedAt < o.endedAt,
            ).length,
        ),
      );
      expect(overlap).toBe(2);
    } finally {
      await runner.close();
    }
  });

  test("with 2 running and 8 waiting, an 11th call is refused", async () => {
    const client = await inMemory({ checkTimeoutMs: 100 });
    try {
      const errors = await burst(client, 11);
      expect(errors.slice(0, 10)).toEqual(Array(10).fill(stopped(100)));
      expect(errors[10]).toBe(queueFull);
    } finally {
      await client.close();
    }
  });

  test("createServer's maxConcurrentChecks sets the cap", async () => {
    const client = await inMemory({
      checkTimeoutMs: 100,
      maxConcurrentChecks: 1,
    });
    try {
      const errors = await burst(client, 10);
      expect(errors.filter((e) => e === queueFull)).toHaveLength(1);
      expect(errors[9]).toBe(queueFull);
    } finally {
      await client.close();
    }
  });

  test("--max-concurrent-checks sets the cap; RAG_MCP_MAX_CONCURRENT_CHECKS too, and the flag wins", async () => {
    const env = { RAG_MCP_MAX_CONCURRENT_CHECKS: "1" };
    const viaEnv = await stdio(["--check-timeout-ms", "100"], env);
    try {
      const errors = await burst(viaEnv, 10);
      expect(errors[9]).toBe(queueFull);
    } finally {
      await viaEnv.close();
    }
    const viaFlag = await stdio(
      ["--check-timeout-ms", "100", "--max-concurrent-checks", "3"],
      env,
    );
    try {
      const errors = await burst(viaFlag, 12);
      expect(errors.slice(0, 11)).toEqual(Array(11).fill(stopped(100)));
      expect(errors[11]).toBe(queueFull);
    } finally {
      await viaFlag.close();
    }
  });

  test.each([
    [["--max-concurrent-checks", "0"], {}, /max-concurrent-checks/],
    [
      [],
      { RAG_MCP_MAX_CONCURRENT_CHECKS: "two" },
      /RAG_MCP_MAX_CONCURRENT_CHECKS/,
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

  test("--help lists the flag and variable", () => {
    const run = spawnSync(process.execPath, [BIN, "--help"], {
      encoding: "utf8",
    });
    expect(run.stderr).toContain("--max-concurrent-checks");
    expect(run.stderr).toContain("RAG_MCP_MAX_CONCURRENT_CHECKS");
  });
});

test("the server answers other calls while a long check runs", async () => {
  const passage = {
    id: "v.md#1",
    source: "v.md",
    score: 1,
    text: "Employees receive twenty days of paid vacation.",
  };
  // A limit the long check can't reach, even on a slow machine
  const client = await inMemory(
    { checkTimeoutMs: 60000 },
    { size: 1, search: async () => [passage] },
  );
  try {
    let checkDone = false;
    const long = check(client, slow).then((r) => {
      checkDone = true;
      return r;
    });
    // Give the check time to start in its worker
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const search = await call(client, "search_documents", {
      query: "vacation",
    });
    const quick = await check(client, {
      answer: "Employees receive twenty days of paid vacation.",
      sources: ["Employees receive twenty days of paid vacation per year."],
    });
    expect(search.error).toBeUndefined();
    expect(quick.result.structuredContent.grounded).toBe(true);
    // Both answered while the long check was still running
    expect(checkDone).toBe(false);
    await long;
  } finally {
    await client.close();
  }
});

test("no check worker is left running: the process exits on its own", () => {
  const run = spawnSync(
    process.execPath,
    [path.join(FIXTURES, "exits-cleanly.js")],
    { encoding: "utf8", timeout: 30000 },
  );
  expect(run.error).toBeUndefined();
  expect(run.status).toBe(0);
  // The first check completed; the second was stopped
  expect(JSON.parse(run.stdout)).toEqual([false, true]);
});
