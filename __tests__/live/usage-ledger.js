"use strict";

/**
 * Jest setup for the live suite (jest.live.config.js): every Claude API
 * call the tests make, here and in the child processes they start (the
 * CLI, the AI SDK 7 script), is logged to
 * ~/.config/rag-pipeline-utils/live-ledger.jsonl by the same hook as the
 * consumer journeys: model, tokens, status and latency, never content or
 * the key. scripts/claude-usage-report.js reads it.
 */

const os = require("os");
const path = require("path");

const hook = path.join(
  __dirname,
  "..",
  "..",
  "scripts",
  "consumer-journeys",
  "ledger-hook.cjs",
);

process.env.RAG_LEDGER =
  process.env.RAG_LEDGER ||
  path.join(os.homedir(), ".config", "rag-pipeline-utils", "live-ledger.jsonl");
process.env.RAG_JOURNEY = process.env.RAG_JOURNEY || "live";
// A ceiling for the live ledger as a whole, well above one run (~$0.50)
process.env.RAG_LEDGER_HARD_CAP_USD =
  process.env.RAG_LEDGER_HARD_CAP_USD || "25";
if (!String(process.env.NODE_OPTIONS || "").includes("ledger-hook.cjs")) {
  // Forward slashes: NODE_OPTIONS reads a backslash inside quotes as an
  // escape, so a Windows path ("C:\Users\...") reached child processes as
  // "C:Users..." and every spawned live test failed to start
  process.env.NODE_OPTIONS =
    `${process.env.NODE_OPTIONS || ""} --require "${hook.replace(/\\/g, "/")}"`.trim();
}

require(hook);
