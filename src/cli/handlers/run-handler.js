/**
 * Run command handler
 * Convenience wrapper: optionally ingest, then optionally query, in one call.
 */

const { handleIngest } = require("./ingest-handler.js");
const { handleQuery } = require("./query-handler.js");

/**
 * @param {object} globalOptions - Global CLI options from program.opts()
 * @param {object} options - { ingest?: string, query?: string, topK?: number, json?: boolean }
 */
async function handleRun(globalOptions, options = {}) {
  if (!options.ingest && !options.query) {
    console.error(
      "❌ Nothing to do: pass --ingest <path> and/or --query <text>",
    );
    process.exitCode = 1;
    return;
  }
  if (options.ingest) {
    await handleIngest(globalOptions, options.ingest, options);
    if (process.exitCode) return;
  }
  if (options.query) {
    await handleQuery(globalOptions, options.query, options);
  }
}

module.exports = { handleRun };
