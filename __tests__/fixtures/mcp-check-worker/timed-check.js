"use strict";

// The real check worker's job, with when and in which thread each check ran
// added to the reply, so a test can see how many ran at once.
const { parentPort, threadId } = require("worker_threads");
const { checkAnswer } = require("../../../packages/rag-mcp-server/lib/library");

parentPort.on("message", async (params) => {
  const startedAt = Date.now();
  const check = await checkAnswer(params);
  parentPort.postMessage({
    ok: true,
    check: { ...check, startedAt, endedAt: Date.now(), threadId },
  });
});
parentPort.postMessage({ ready: true });
