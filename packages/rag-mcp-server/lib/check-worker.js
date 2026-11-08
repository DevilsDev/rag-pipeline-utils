"use strict";

/**
 * Runs checkAnswer for check-runner.js in a worker thread, so a check that
 * runs too long can be stopped. Posts { ready: true } once loaded, then one
 * reply per check: { ok: true, check, heapUsed } or
 * { ok: false, message, heapUsed }, heapUsed being this worker's heap in
 * bytes after the check.
 */

const v8 = require("v8");
const { parentPort } = require("worker_threads");
const { checkAnswer } = require("./library");

const heapUsed = () => v8.getHeapStatistics().used_heap_size;

parentPort.on("message", async (params) => {
  try {
    const check = await checkAnswer(params);
    parentPort.postMessage({ ok: true, check, heapUsed: heapUsed() });
  } catch (error) {
    parentPort.postMessage({
      ok: false,
      message: error.message,
      heapUsed: heapUsed(),
    });
  }
});
parentPort.postMessage({ ready: true });
