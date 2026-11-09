"use strict";

// The rag-mcp-server command, with slow-check.js as its check worker. Run
// with the same arguments as bin/rag-mcp-server.js.
const path = require("path");

require("./use-check-worker")(path.join(__dirname, "slow-check.js"));
require("../../../packages/rag-mcp-server/bin/rag-mcp-server");
