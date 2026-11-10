"use strict";

/**
 * The scoped packages this server uses. An installed package loads them
 * from npm. In a development checkout of rag-pipeline-utils that hasn't
 * been built (packages/<name>/dist is missing, as in CI's test job), it
 * falls back to the same entries in the repository's src/packages/, the
 * way the main package's bin/cli.js falls back to src/.
 */

const fs = require("fs");
const path = require("path");

function load(name, entry) {
  try {
    return require(name);
  } catch (error) {
    const dev = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "src",
      "packages",
      entry,
    );
    if (error.code === "MODULE_NOT_FOUND" && fs.existsSync(dev)) {
      return require(dev);
    }
    throw error;
  }
}

const { ChunkingEngine, MemoryRetriever } = load(
  "@devilsdev/rag-core",
  "core.js",
);
const { LocalEmbedder } = load("@devilsdev/rag-connectors", "connectors.js");
const { checkAnswer, splitSentences, splitClauses } = load(
  "@devilsdev/rag-eval",
  "eval.js",
);

module.exports = {
  ChunkingEngine,
  MemoryRetriever,
  LocalEmbedder,
  checkAnswer,
  splitSentences,
  splitClauses,
};
