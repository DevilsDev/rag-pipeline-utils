/**
 * @devilsdev/rag-mcp-server: a check worker reports its heap after each
 * check, and the runner reuses it only while that heap is under
 * reuseHeapLimitMb (256 MB by default). checkAnswer caches the quantities
 * of recent sources, so without this a worker that checks many distinct
 * large sources runs out of memory.
 */

const path = require("path");
const { Worker } = require("worker_threads");
const {
  createCheckRunner,
} = require("../../../packages/rag-mcp-server/lib/check-runner");

const WORKER = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "packages",
  "rag-mcp-server",
  "lib",
  "check-worker.js",
);
const WITH_THREAD_ID = path.join(
  __dirname,
  "..",
  "..",
  "fixtures",
  "mcp-check-worker",
  "with-thread-id.js",
);

jest.setTimeout(120000);

// The suite runs on fake timers; the runner's time limit needs real ones.
beforeEach(() => jest.useRealTimers());

// A distinct 200 KB source of quantities each time: its quantities are
// cached in the worker (about 4 MB each)
const largeSource = (i) =>
  `Staff carry ${1000 + i} kg ${"5 kg ".repeat(39990).trim()}.`;
const largeCheck = (i) => ({
  answer: "Staff carry 5 kg.",
  sources: [largeSource(i)],
  evaluate: false,
});

/** Run `n` checks one after another; the checks, or the first error. */
async function runAll(runner, n, make) {
  const checks = [];
  for (let i = 0; i < n; i++) {
    try {
      checks.push(await runner.run(make(i)));
    } catch (error) {
      return { checks, error };
    }
  }
  return { checks, error: null };
}

test("the check worker reports its heap after each check", async () => {
  const worker = new Worker(WORKER);
  try {
    const next = () =>
      new Promise((resolve) => worker.once("message", resolve));
    expect(await next()).toEqual({ ready: true });
    worker.postMessage({ answer: "Cats sleep.", sources: ["Cats sleep."] });
    const ok = await next();
    expect(ok.ok).toBe(true);
    expect(ok.heapUsed).toBeGreaterThan(1024 * 1024);
    worker.postMessage({ answer: 42 });
    const failed = await next();
    expect(failed.ok).toBe(false);
    expect(failed.heapUsed).toBeGreaterThan(1024 * 1024);
  } finally {
    await worker.terminate();
  }
});

describe("checks against distinct large sources", () => {
  // A 64 MB heap holds about a dozen cached sources; 30 are checked
  const limits = { maxOldGenerationSizeMb: 64 };

  test("without a reuse limit the reused worker runs out of memory", async () => {
    const runner = createCheckRunner({
      timeoutMs: 60000,
      resourceLimits: limits,
      reuseHeapLimitMb: Infinity,
      file: WITH_THREAD_ID,
    });
    try {
      const { checks, error } = await runAll(runner, 30, largeCheck);
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/stopped unexpectedly: .*memory limit/);
      expect(new Set(checks.map((c) => c.threadId)).size).toBe(1);
    } finally {
      await runner.close();
    }
  });

  test("with a reuse limit the worker is replaced and no check runs out of memory", async () => {
    const runner = createCheckRunner({
      timeoutMs: 60000,
      resourceLimits: limits,
      reuseHeapLimitMb: 32,
      file: WITH_THREAD_ID,
    });
    try {
      const { checks, error } = await runAll(runner, 30, largeCheck);
      expect(error).toBeNull();
      expect(checks).toHaveLength(30);
      for (const c of checks) expect(c.grounded).toBe(true);
      expect(new Set(checks.map((c) => c.threadId)).size).toBeGreaterThan(1);
    } finally {
      await runner.close();
    }
  });
});

test("small sources keep reusing one worker at the default limit", async () => {
  const runner = createCheckRunner({ timeoutMs: 60000, file: WITH_THREAD_ID });
  try {
    const { checks, error } = await runAll(runner, 20, (i) => ({
      answer: `Employees receive ${i + 2} days of paid vacation.`,
      sources: [`Employees receive ${i + 2} days of paid vacation per year.`],
      evaluate: false,
    }));
    expect(error).toBeNull();
    expect(checks).toHaveLength(20);
    expect(new Set(checks.map((c) => c.threadId)).size).toBe(1);
  } finally {
    await runner.close();
  }
});
