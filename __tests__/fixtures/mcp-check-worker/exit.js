"use strict";

// A check worker that exits on its first check without replying.
const { parentPort } = require("worker_threads");

parentPort.on("message", () => process.exit(3));
parentPort.postMessage({ ready: true });
