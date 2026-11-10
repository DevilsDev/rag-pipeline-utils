"use strict";
// Tests that assert on wall-clock time: linear-time and ReDoS checks, and
// the MCP server's size and time limits. CI runs them on their own with
// --runInBand (npm run test:timing), so a busy parallel run can't push them
// over their limits; the main CI run leaves them out with
// RAG_SKIP_TIMING_TESTS=1. A plain `npm test` still runs them.
module.exports = [
  "__tests__/unit/agentic/query-planner-decomposition.test.js",
  "__tests__/unit/cli/cli-key-errors.test.js",
  "__tests__/unit/ecosystem/tar-extract-pax.test.js",
  "__tests__/unit/evaluate/identifier-linear-time.test.js",
  "__tests__/unit/evaluate/prepared-sources.test.js",
  "__tests__/unit/evaluate/text-normalisation.test.js",
  "__tests__/unit/graph/entity-extractor-linear-time.test.js",
  "__tests__/unit/guardrails/linear-time-patterns.test.js",
  "__tests__/unit/packages/rag-mcp-server-cancel.test.js",
  "__tests__/unit/packages/rag-mcp-server-check-timeout.test.js",
  "__tests__/unit/packages/rag-mcp-server-clause-limit.test.js",
  "__tests__/unit/packages/rag-mcp-server-html.test.js",
];
