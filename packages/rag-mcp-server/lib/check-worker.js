"use strict";

/**
 * Runs checkAnswer for check-runner.js in a worker thread, so a check that
 * runs too long can be stopped. Posts { ready: true } once loaded, then one
 * reply per check: { ok: true, check } or { ok: false, message }.
 */

const { parentPort } = require("worker_threads");
const { checkAnswer } = require("./library");

parentPort.on("message", async (params) => {
  try {
    parentPort.postMessage({ ok: true, check: await checkAnswer(params) });
  } catch (error) {
    parentPort.postMessage({ ok: false, message: error.message });
  }
});
parentPort.postMessage({ ready: true });
