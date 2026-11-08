"use strict";

// The real check worker (packages/rag-mcp-server/lib/check-worker.js), with
// the worker's threadId added to each check it returns, so a test can tell
// whether checks ran in the same worker.
const { parentPort, threadId } = require("worker_threads");

const post = parentPort.postMessage.bind(parentPort);
parentPort.postMessage = (message) =>
  post(
    message.ok
      ? { ...message, check: { ...message.check, threadId } }
      : message,
  );
require("../../../packages/rag-mcp-server/lib/check-worker");
