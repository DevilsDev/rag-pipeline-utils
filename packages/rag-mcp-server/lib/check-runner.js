"use strict";

/**
 * Runs checkAnswer in a worker thread with a time limit. A check that runs
 * past the limit is stopped by terminating its worker; the worker's heap is
 * bounded by resourceLimits.
 *
 * Starting a worker and loading the library takes about 100-250 ms, so one
 * started worker is kept for the next check (it doesn't keep the process
 * alive). A check that finds it busy starts a worker of its own, and a
 * stopped or failed worker is replaced.
 *
 * checkAnswer caches the quantities of recent sources (up to 256), about
 * 4 MB each for a 200 KB source, so a reused worker's heap grows with the
 * distinct sources it has checked. A worker is kept only while its heap is
 * under reuseHeapLimitMb after a check; otherwise the next check starts a
 * fresh one, before the heap reaches resourceLimits.
 *
 * At most maxConcurrent checks run at once; up to maxQueue more wait for a
 * free slot, and further checks are refused. Waiting doesn't count toward
 * the time limit.
 */

const path = require("path");
const { Worker } = require("worker_threads");

const WORKER_FILE = path.join(__dirname, "check-worker.js");
const RESOURCE_LIMITS = { maxOldGenerationSizeMb: 512 };

/** A check stopped at the time limit. */
class CheckTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`the check took longer than ${timeoutMs} ms`);
    this.name = "CheckTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/** A check refused because maxQueue checks are already waiting. */
class CheckQueueFullError extends Error {
  constructor() {
    super("too many checks waiting");
    this.name = "CheckQueueFullError";
  }
}

/** The next message from `worker`; rejects if it fails or exits first. */
function nextMessage(worker) {
  return new Promise((resolve, reject) => {
    const done = () => {
      worker.off("message", onMessage);
      worker.off("error", onError);
      worker.off("exit", onExit);
    };
    const onMessage = (message) => {
      done();
      resolve(message);
    };
    const onError = (error) => {
      done();
      reject(new Error(`the check stopped unexpectedly: ${error.message}`));
    };
    const onExit = (code) => {
      done();
      reject(new Error(`the check stopped unexpectedly (exit code ${code})`));
    };
    worker.on("message", onMessage);
    worker.on("error", onError);
    worker.on("exit", onExit);
  });
}

/**
 * @param {{timeoutMs: number, maxConcurrent?: number, maxQueue?: number, reuseHeapLimitMb?: number, file?: string, resourceLimits?: object}} options
 *   maxConcurrent and maxQueue default to 2 and 8, reuseHeapLimitMb to 256;
 *   file and resourceLimits to check-worker.js and a 512 MB heap
 * @returns {{run: (params: object) => Promise<object>, close: () => Promise<void>}}
 *   run rejects with a CheckTimeoutError at the time limit, a
 *   CheckQueueFullError when the queue is full, and with the error
 *   checkAnswer threw, or a crash, otherwise
 */
function createCheckRunner({
  timeoutMs,
  maxConcurrent = 2,
  maxQueue = 8,
  reuseHeapLimitMb = 256,
  file = WORKER_FILE,
  resourceLimits = RESOURCE_LIMITS,
}) {
  let idle = null;
  let closed = false;
  const running = new Set();
  let active = 0;
  const waiting = [];

  /** Take a slot to run a check, waiting in the queue if none is free. */
  async function acquire() {
    if (active < maxConcurrent) {
      active += 1;
      return;
    }
    if (waiting.length >= maxQueue) throw new CheckQueueFullError();
    // The slot is handed over by releaseSlot(), so `active` stays the same
    await new Promise((resolve, reject) => waiting.push({ resolve, reject }));
  }

  /** Hand the slot to the next waiting check, or free it. */
  function releaseSlot() {
    if (waiting.length > 0) waiting.shift().resolve();
    else active -= 1;
  }

  function start() {
    const worker = new Worker(file, { resourceLimits });
    worker.unref();
    // Errors are reported to the check that is running, if any
    worker.on("error", () => {});
    worker.once("exit", () => {
      worker.exited = true;
      if (idle === worker) idle = null;
    });
    worker.ready = nextMessage(worker);
    worker.ready.catch(() => {});
    return worker;
  }

  /**
   * Keep the worker for the next check, or stop it if one is kept or its
   * heap (`heapUsed`, in bytes) is at reuseHeapLimitMb or more.
   */
  function release(worker, heapUsed) {
    worker.unref();
    // A reply without heapUsed counts as under the limit
    const underLimit = !(heapUsed >= reuseHeapLimitMb * 1024 * 1024);
    if (idle === null && !closed && !worker.exited && underLimit) {
      idle = worker;
    } else {
      worker.terminate();
    }
  }

  async function run(params) {
    if (closed) throw new Error("the server is closed");
    await acquire();
    try {
      return await runInWorker(params);
    } finally {
      releaseSlot();
    }
  }

  async function runInWorker(params) {
    if (closed) throw new Error("the server is closed");
    const worker = idle || start();
    idle = null;
    running.add(worker);
    worker.ref();
    try {
      // Startup doesn't count toward the time limit
      await worker.ready;
      const reply = nextMessage(worker);
      reply.catch(() => {});
      worker.postMessage(params);
      let timer;
      const timeout = new Promise((resolve, reject) => {
        timer = setTimeout(
          () => reject(new CheckTimeoutError(timeoutMs)),
          timeoutMs,
        );
      });
      let message;
      try {
        message = await Promise.race([reply, timeout]);
      } finally {
        clearTimeout(timer);
      }
      release(worker, message.heapUsed);
      if (!message.ok)
        throw Object.assign(new Error(message.message), { fromCheck: true });
      return message.check;
    } catch (error) {
      if (!error.fromCheck) {
        worker.terminate();
        if (idle === null && !closed) idle = start();
      }
      throw error;
    } finally {
      running.delete(worker);
    }
  }

  return {
    run,
    /** Stop every worker; later checks are refused. */
    async close() {
      closed = true;
      for (const { reject } of waiting.splice(0)) {
        reject(new Error("the server is closed"));
      }
      const workers = [...running, ...(idle ? [idle] : [])];
      idle = null;
      await Promise.all(workers.map((w) => w.terminate()));
    },
  };
}

module.exports = { createCheckRunner, CheckTimeoutError, CheckQueueFullError };
