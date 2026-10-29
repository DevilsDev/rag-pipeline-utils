"use strict";

/**
 * `rag-pipeline ai ...`: training, benchmarking, relevance feedback and file
 * inspection built on the real pipeline components (.ragrc.json + index).
 */

const { Command, Option } = require("commander");
const { parsePositiveInteger } = require("../shared/cli-utils.js");
// The handler (document loaders: jsdom, marked, csv-parse) loads when an
// ai command runs, not when the CLI starts.
const aiHandler = () => require("../handlers/ai-handler.js"); // eslint-disable-line global-require

/**
 * @param {() => object} getGlobalOptions - Returns program.opts()
 * @returns {Command}
 */
function createAiCommand(getGlobalOptions) {
  const ai = new Command("ai").description(
    "Train the local embedder, benchmark queries, relevance feedback, file inspection",
  );

  const train = ai
    .command("train")
    .description("Fit corpus-trained components");
  train
    .command("embedding")
    .description(
      "Refit the local TF-IDF embedder (on the index, or on [path]) and re-embed the index",
    )
    .argument(
      "[path]",
      "Train on documents from this file or directory instead",
    )
    .action(async (inputPath) => {
      await aiHandler().handleTrainEmbedding(getGlobalOptions(), inputPath);
    });

  ai.command("benchmark")
    .description(
      "Measure query latency against the configured pipeline and index",
    )
    .option(
      "--queries <file>",
      "Queries file: JSON array of strings or one per line (default: sampled from the index)",
    )
    .option("--runs <n>", "Passes over the query set", parsePositiveInteger, 3)
    .option("--top-k <n>", "Passages to retrieve", parsePositiveInteger, 3)
    .option("--json", "Print the measurements as JSON")
    .action(async (options) => {
      await aiHandler().handleBenchmark(getGlobalOptions(), options);
    });

  ai.command("feedback")
    .description(
      "Record whether an indexed chunk was a good result for a question",
    )
    .argument("<question>", "Question the chunk was returned for")
    .argument("<docId>", "Chunk id as shown by `ai search` (e.g. docs/a.md#0)")
    .addOption(
      new Option("--rating <rating>", "Relevance vote")
        .choices(["up", "down"])
        .makeOptionMandatory(),
    )
    .action(async (question, docId, options) => {
      await aiHandler().handleFeedback(
        getGlobalOptions(),
        question,
        docId,
        options,
      );
    });

  ai.command("search")
    .description(
      "Retrieve passages re-scored with stored feedback (retrieval only)",
    )
    .argument("<question>", "Question text")
    .option("--top-k <n>", "Passages to return", parsePositiveInteger, 3)
    .option("--json", "Print the results as JSON")
    .action(async (question, options) => {
      await aiHandler().handleSearch(getGlobalOptions(), question, options);
    });

  const multimodal = ai
    .command("multimodal")
    .description("Inspect files before ingesting");
  multimodal
    .command("process")
    .description(
      "Report type, characters and chunks for text files (images need a vision model)",
    )
    .argument("<path>", "File or directory")
    .option("--json", "Print the report as JSON")
    .action(async (inputPath, options) => {
      await aiHandler().handleMultimodalProcess(
        getGlobalOptions(),
        inputPath,
        options,
      );
    });

  return ai;
}

module.exports = { createAiCommand };
