/**
 * @devilsdev/rag-mcp-server: a check_answer call the client abandons leaves
 * the check queue, and a check it abandons while running is stopped (the
 * request's cancellation signal, `extra.signal`). Over stdio, the server
 * closes when stdin ends, which stops the workers.
 *
 * Time limits are fixed ceilings measured with performance.now(). The
 * checks to cancel run in a test-only worker (slow-check.js) that never
 * finishes one whose answer is SLOW_ANSWER, so the tests don't depend on
 * how fast checkAnswer is on the machine.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { performance } = require("perf_hooks");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = require("@modelcontextprotocol/sdk/inMemory.js");
const useCheckWorker = require("../../fixtures/mcp-check-worker/use-check-worker");
const { SLOW_ANSWER } = require("../../fixtures/mcp-check-worker/slow-answer");

const FIXTURES = path.join(
  __dirname,
  "..",
  "..",
  "fixtures",
  "mcp-check-worker",
);
const SLOW_WORKER = path.join(FIXTURES, "slow-check.js");
// The rag-mcp-server command with SLOW_WORKER as its check worker
const SLOW_SERVER = path.join(FIXTURES, "slow-server.js");

// createServer's checks run in SLOW_WORKER (before server.js loads)
useCheckWorker(SLOW_WORKER);
const { createServer } = require("../../../packages/rag-mcp-server/lib/server");
const {
  createCheckRunner,
  CheckAbortedError,
  CheckQueueFullError,
} = require("../../../packages/rag-mcp-server/lib/check-runner");

jest.setTimeout(60000);

// The suite runs on fake timers; these tests need real ones.
beforeEach(() => jest.useRealTimers());

// Never finishes in SLOW_WORKER: runs until it is cancelled or stopped
const slow = { answer: SLOW_ANSWER, sources: [SLOW_ANSWER] };
const quick = { answer: "Hi.", sources: ["Hi."] };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settled = (promise) =>
  promise.then(
    () => ({ ok: true }),
    (error) => ({ error }),
  );

describe("the check runner and a cancellation signal", () => {
  test("a call abandoned in the queue leaves it", async () => {
    // One running, one queue place
    const runner = createCheckRunner({
      timeoutMs: 60000,
      maxConcurrent: 1,
      maxQueue: 1,
      file: SLOW_WORKER,
    });
    const running = new AbortController();
    const waiting = new AbortController();
    try {
      const first = settled(runner.run(slow, { signal: running.signal }));
      await sleep(300);
      const second = settled(runner.run(quick, { signal: waiting.signal }));
      await sleep(50);
      // The queue is full
      await expect(runner.run(quick)).rejects.toBeInstanceOf(
        CheckQueueFullError,
      );
      const start = performance.now();
      waiting.abort();
      expect((await second).error).toBeInstanceOf(CheckAbortedError);
      expect(performance.now() - start).toBeLessThan(1000);
      // Its place is free again: this call waits instead of being refused
      const third = settled(runner.run(quick));
      await sleep(50);
      running.abort();
      expect((await first).error).toBeInstanceOf(CheckAbortedError);
      expect((await third).ok).toBe(true);
    } finally {
      await runner.close();
    }
  });

  test("a running check the caller abandons is stopped", async () => {
    const runner = createCheckRunner({
      timeoutMs: 60000,
      maxConcurrent: 1,
      file: SLOW_WORKER,
    });
    const controller = new AbortController();
    try {
      const outcome = settled(runner.run(slow, { signal: controller.signal }));
      await sleep(400);
      const start = performance.now();
      controller.abort();
      expect((await outcome).error).toBeInstanceOf(CheckAbortedError);
      expect(performance.now() - start).toBeLessThan(2000);
      // The slot is free and the next check runs in a fresh worker
      const next = performance.now();
      const ok = await runner.run(quick);
      expect(ok.grounded).toBe(true);
      expect(performance.now() - next).toBeLessThan(8000);
    } finally {
      await runner.close();
    }
  });

  test("a signal that is already aborted runs nothing", async () => {
    const runner = createCheckRunner({ timeoutMs: 60000 });
    try {
      await expect(
        runner.run(quick, { signal: AbortSignal.abort() }),
      ).rejects.toBeInstanceOf(CheckAbortedError);
    } finally {
      await runner.close();
    }
  });
});

describe("a client that cancels check_answer", () => {
  test("frees the slot for the next call and stops the check", async () => {
    const server = createServer(
      { size: 0, search: async () => [] },
      { maxConcurrentChecks: 1 },
    );
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: "cancel-test", version: "1.0.0" });
    await client.connect(clientSide);
    try {
      const controller = new AbortController();
      const abandoned = settled(
        client.callTool({ name: "check_answer", arguments: slow }, undefined, {
          signal: controller.signal,
          timeout: 60000,
        }),
      );
      await sleep(500);
      controller.abort();
      await abandoned;
      const start = performance.now();
      const reply = await client.callTool({
        name: "check_answer",
        arguments: quick,
      });
      expect(reply.isError).toBeFalsy();
      // Behind the abandoned check it would wait forever
      expect(performance.now() - start).toBeLessThan(6000);
    } finally {
      await client.close();
    }
  });
});

describe("over stdio, the server closes when stdin ends", () => {
  test("a running check is stopped and the process exits well before the time limit", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rag-mcp-stdin-"));
    fs.writeFileSync(path.join(tmp, "a.md"), "Twenty days of vacation.\n");
    const child = spawn(process.execPath, [SLOW_SERVER, tmp], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", () => {});
    const exited = new Promise((resolve) =>
      child.on("exit", (code, signal) => resolve({ code, signal })),
    );
    const send = (message) =>
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
    const waitFor = async (predicate, ms) => {
      const end = performance.now() + ms;
      while (!predicate()) {
        if (performance.now() > end) throw new Error("timed out");
        await sleep(25);
      }
    };
    try {
      send({
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "stdin-test", version: "1.0.0" },
        },
      });
      await waitFor(() => stdout.includes('"id":1'), 20000);
      send({ method: "notifications/initialized" });
      send({
        id: 2,
        method: "tools/call",
        params: { name: "check_answer", arguments: slow },
      });
      // Let the check start in its worker (it would run to the 10 s limit)
      await sleep(1500);
      const start = performance.now();
      child.stdin.end();
      const { code } = await Promise.race([
        exited,
        sleep(8000).then(() => ({ code: "still running" })),
      ]);
      const elapsed = performance.now() - start;
      expect(code).toBe(0);
      expect(elapsed).toBeLessThan(5000);
    } finally {
      child.kill();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
