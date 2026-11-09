"use strict";

// A check worker that crashes on its first check: an uncaught exception.
const { parentPort } = require("worker_threads");

parentPort.on("message", () => {
  setImmediate(() => {
    throw new Error("worker crashed on purpose");
  });
});
parentPort.postMessage({ ready: true });
