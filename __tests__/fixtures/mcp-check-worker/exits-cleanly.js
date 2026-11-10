"use strict";

// Run by rag-mcp-server-check-timeout.test.js in its own process: a check
// that completes, a check that is stopped, then the client disconnects. The
// process must then exit on its own, with no check worker left running.
const path = require("path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = require("@modelcontextprotocol/sdk/inMemory.js");
const { SLOW_ANSWER } = require("./slow-answer");

// Checks run in slow-check.js, which never finishes SLOW_ANSWER
require("./use-check-worker")(path.join(__dirname, "slow-check.js"));
const { createServer } = require(
  path.join(__dirname, "../../../packages/rag-mcp-server/lib/server"),
);

(async () => {
  const server = createServer(
    { size: 0, search: async () => [] },
    { checkTimeoutMs: 200 },
  );
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "exit-test", version: "1.0.0" });
  await client.connect(clientSide);
  const call = (args) =>
    client.callTool({ name: "check_answer", arguments: args });
  const ok = await call({ answer: "Cats sleep.", sources: ["Cats sleep."] });
  const slow = await call({ answer: SLOW_ANSWER, sources: [SLOW_ANSWER] });
  await client.close();
  process.stdout.write(JSON.stringify([!!ok.isError, !!slow.isError]));
})();
