"use strict";

// Makes createServer's check runner use a test-only worker file. Call it
// before packages/rag-mcp-server/lib/server.js is first required: the
// server reads createCheckRunner from check-runner.js when it loads.
const path = require("path");

const checkRunner = require(
  path.join(__dirname, "../../../packages/rag-mcp-server/lib/check-runner"),
);

module.exports = function useCheckWorker(file) {
  const create = checkRunner.createCheckRunner;
  checkRunner.createCheckRunner = (options) => create({ file, ...options });
};
