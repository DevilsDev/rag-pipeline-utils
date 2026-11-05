"use strict";

/**
 * Credentials for the live API tests (npm run test:live). Never part of the
 * normal run or CI: jest.config.js ignores __tests__/live/.
 *
 * The key comes from ANTHROPIC_API_KEY, or from an env file outside the
 * repository (RAG_LIVE_ENV, default ~/.config/rag-pipeline-utils/live-test.env)
 * with lines `ANTHROPIC_API_KEY=...` and, optionally,
 * `LIVE_TESTS_UNTIL=<ISO date>`, after which the key is not used.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_FILE = path.join(
  os.homedir(),
  ".config",
  "rag-pipeline-utils",
  "live-test.env",
);

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/** @returns {{ apiKey: string|null, reason: string|null }} */
function liveAnthropic() {
  const file = readEnvFile(process.env.RAG_LIVE_ENV || DEFAULT_FILE);
  const apiKey = process.env.ANTHROPIC_API_KEY || file.ANTHROPIC_API_KEY;
  const until = process.env.LIVE_TESTS_UNTIL || file.LIVE_TESTS_UNTIL;
  if (!apiKey) {
    return { apiKey: null, reason: "no ANTHROPIC_API_KEY or live-test.env" };
  }
  if (until && Date.now() > Date.parse(until)) {
    return {
      apiKey: null,
      reason: `the live-test key expired at ${until}; rotate it and update live-test.env`,
    };
  }
  return { apiKey, reason: null };
}

/**
 * Pinecone for the PineconeRetriever live test: PINECONE_API_KEY and the
 * index to use (PINECONE_INDEX, its name, or PINECONE_INDEX_HOST), from the
 * environment or the same env file. The test writes to a namespace of its
 * own and deletes it; it never creates or deletes an index.
 * @returns {{ apiKey: string|null, index?: string, host?: string, reason: string|null }}
 */
function livePinecone() {
  const file = readEnvFile(process.env.RAG_LIVE_ENV || DEFAULT_FILE);
  const get = (k) => process.env[k] || file[k];
  const apiKey = get("PINECONE_API_KEY");
  const index = get("PINECONE_INDEX");
  const host = get("PINECONE_INDEX_HOST");
  if (!apiKey) return { apiKey: null, reason: "no PINECONE_API_KEY" };
  if (!index && !host) {
    return {
      apiKey: null,
      reason: "set PINECONE_INDEX (or PINECONE_INDEX_HOST)",
    };
  }
  return { apiKey, index, host, reason: null };
}

/** The cheapest current model, with small outputs, to keep runs cheap. */
const MODEL = process.env.LIVE_ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

module.exports = { liveAnthropic, livePinecone, MODEL };
