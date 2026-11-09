"use strict";

// The real check worker (packages/rag-mcp-server/lib/check-worker.js), with
// the worker's threadId and its reported heapUsed added to each check it
// returns, so a test can tell whether checks ran in the same worker and why
// a worker was replaced.
const { parentPort, threadId } = require("worker_threads");

const post = parentPort.postMessage.bind(parentPort);
parentPort.postMessage = (message) =>
  post(
    message.ok
      ? {
          ...message,
          check: { ...message.check, threadId, heapUsed: message.heapUsed },
        }
      : message,
  );
require("../../../packages/rag-mcp-server/lib/check-worker");
