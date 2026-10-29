/**
 * generate-dataset command handler
 * Writes an evaluation test set from the ingested index: the configured
 * llm writes question and answer pairs about each chunk, and every case
 * records its source file, so `rag-pipeline eval` can check retrieval too.
 *
 * Options: --output <file> (required), --count, --per-document,
 * --min-faithfulness, --concurrency, --force (overwrite --output).
 */

const fs = require("fs");
const path = require("path");
const { loadCliConfig } = require("../shared/config-context.js");
const { loadComponents } = require("../services/rag-service.js");
const { generateSyntheticDataset } = require("../../evaluate/synthetic.js");

async function handleGenerateDataset(globalOptions, options = {}) {
  try {
    const output = path.resolve(options.output);
    if (fs.existsSync(output) && !options.force) {
      console.error(
        `❌ ${options.output} already exists. Pass --force to replace it (reviewed cases would be lost).`,
      );
      process.exitCode = 1;
      return;
    }

    const { config, configDir } = loadCliConfig(globalOptions);
    const components = loadComponents({ config, configDir });
    if (!components.llm) {
      console.error(
        "❌ generate-dataset needs an llm stage in the config to write the questions.",
      );
      process.exitCode = 1;
      return;
    }
    if (typeof components.retriever.list !== "function") {
      console.error(
        "❌ The retriever can't list its documents; generate-dataset reads them from the CLI's file-store index.",
      );
      process.exitCode = 1;
      return;
    }
    const documents = components.retriever.list();
    const count = options.count || 20;

    if (globalOptions.dryRun) {
      console.log(
        `🧪 Dry run: would write up to ${count} cases from ${documents.length} indexed chunks to ${options.output}`,
      );
      return;
    }

    const quiet = Boolean(globalOptions.quiet);
    let written = 0;
    const dataset = await generateSyntheticDataset(documents, {
      llm: components.llm,
      count,
      perDocument: options.perDocument || 1,
      ...(options.minFaithfulness !== undefined && {
        minFaithfulness: options.minFaithfulness,
      }),
      concurrency: options.concurrency || 1,
      onCase: () => {
        written += 1;
        if (!quiet && process.stderr.isTTY) {
          process.stderr.write(`\rGenerated ${written}/${count}`);
        }
      },
    });
    if (!quiet && process.stderr.isTTY) process.stderr.write("\n");

    fs.writeFileSync(output, `${JSON.stringify(dataset.cases, null, 2)}\n`);

    if (!quiet && dataset.skipped.length > 0) {
      const reasons = {};
      for (const s of dataset.skipped) {
        const reason = s.reason.replace(/ \(faithfulness [\d.]+\)$/, "");
        reasons[reason] = (reasons[reason] || 0) + 1;
      }
      console.log("Skipped:");
      for (const [reason, n] of Object.entries(reasons)) {
        console.log(`  ${n} × ${reason}`);
      }
    }
    if (dataset.cases.length === 0) {
      console.error(
        `❌ No cases were generated from ${documents.length} chunks; see the reasons above.`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `✅ Wrote ${dataset.cases.length} case${dataset.cases.length === 1 ? "" : "s"} to ${options.output}. ` +
        'Review them: fix or delete wrong ones and set "reviewed": true.',
    );
  } catch (error) {
    console.error(`❌ Generating the dataset failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { handleGenerateDataset };
