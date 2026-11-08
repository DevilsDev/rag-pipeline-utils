"use strict";

// Run by rag-mcp-server-check-timeout.test.js in its own process. A check
// that would take minutes runs (limit 300 s) while search_documents and a
// quick check_answer are called; then the client disconnects. Prints what
// happened as JSON. The process exits on its own only if closing stopped the
// long check's worker: a running check keeps it alive until its time limit.
const path = require("path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = require("@modelcontextprotocol/sdk/inMemory.js");
const { createServer } = require(
  path.join(__dirname, "../../../packages/rag-mcp-server/lib/server"),
);

const quantities = (n) => `Staff carry ${"5 kg ".repeat(n).trim()}.`;

(async () => {
  const passage = {
    id: "v.md#1",
    source: "v.md",
    score: 1,
    text: "Employees receive twenty days of paid vacation.",
  };
  const server = createServer(
    { size: 1, search: async () => [passage] },
    { checkTimeoutMs: 300000 },
  );
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "other-calls", version: "1.0.0" });
  await client.connect(clientSide);

  // About 471 s to check (10,000 quantities × 15 sources of 200,000 chars)
  let longDone = false;
  const long = client
    .callTool(
      {
        name: "check_answer",
        arguments: {
          answer: quantities(9990),
          sources: Array(15).fill(quantities(39995)),
        },
      },
      undefined,
      { timeout: 600000 },
    )
    .then(
      (r) => ({ isError: !!r.isError, text: r.content[0].text }),
      (error) => ({ thrown: error.message }),
    )
    .finally(() => {
      longDone = true;
    });
  // Let it reach its worker
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const search = await client.callTool({
    name: "search_documents",
    arguments: { query: "vacation" },
  });
  const quick = await client.callTool({
    name: "check_answer",
    arguments: {
      answer: "Employees receive twenty days of paid vacation.",
      sources: ["Employees receive twenty days of paid vacation per year."],
    },
  });
  const longDoneBeforeClose = longDone;
  await client.close();
  const longResult = await long;
  process.stdout.write(
    JSON.stringify({
      searchIsError: !!search.isError,
      quickGrounded: quick.structuredContent.grounded,
      longDoneBeforeClose,
      longResult,
    }),
  );
})();
