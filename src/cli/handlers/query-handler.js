/**
 * Query command handler
 * Answers a question from the ingested index. Without an llm stage it prints
 * the retrieved passages instead of an answer.
 */

const { loadCliConfig } = require("../shared/config-context.js");
const { query } = require("../services/rag-service.js");

function printPassages(results) {
  // A score of 0 means no overlap with the question at all.
  const matches = results.filter((doc) => !(doc.score <= 0));
  if (matches.length === 0) {
    console.log("No matching passages found.");
    return;
  }
  matches.forEach((doc, i) => {
    const source = doc.metadata?.source || doc.id;
    const score = typeof doc.score === "number" ? doc.score.toFixed(3) : "-";
    console.log(`\n[${i + 1}] ${source} (score ${score})`);
    console.log(doc.content);
  });
}

/**
 * @param {object} globalOptions - Global CLI options from program.opts()
 * @param {string} question - Query text
 * @param {object} options - Command-specific options
 */
async function handleQuery(globalOptions, question, options = {}) {
  try {
    const { config, configDir } = loadCliConfig(globalOptions);
    const topK = options.topK || 3;

    if (globalOptions.dryRun) {
      console.log(`🧪 Dry run: would query the index for: ${question}`);
      return;
    }

    const result = await query({ config, configDir, question, topK });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (result.answer === null) {
      console.log("No llm stage configured; showing retrieved passages.");
    } else {
      console.log(result.answer);
      console.log("\nSources:");
    }
    printPassages(result.results);
  } catch (error) {
    console.error(`❌ Query failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { handleQuery };
