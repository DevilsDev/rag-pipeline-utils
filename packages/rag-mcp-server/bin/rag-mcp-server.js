#!/usr/bin/env node
"use strict";

const { main } = require("../lib/server");

main(process.argv.slice(2)).then(
  (code) => {
    if (code !== undefined) process.exitCode = code;
  },
  (error) => {
    process.stderr.write(`rag-mcp-server: ${error.stack || error}\n`);
    process.exit(1);
  },
);
