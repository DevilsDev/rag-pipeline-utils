"use strict";

// The real check worker, except that a check whose answer is SLOW_ANSWER
// never finishes: it keeps the worker busy until the runner stops it. Lets
// the time-limit tests reach their limit however fast checkAnswer is.
const { parentPort } = require("worker_threads");
const { SLOW_ANSWER } = require("./slow-answer");

// Registered before the real worker's listener, so it runs first
parentPort.on("message", (params) => {
  if (params && params.answer === SLOW_ANSWER) {
    for (;;);
  }
});
require("../../../packages/rag-mcp-server/lib/check-worker");
