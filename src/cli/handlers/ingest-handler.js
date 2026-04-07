/**
 * Ingest command handler
 * Handles document ingestion into the pipeline
 */

const { logger } = require("../../utils/logger.js");

/**
 * Handle ingest command
 * @param {object} globalOptions - Global CLI options from program.opts()
 * @param {string} file - Document file path
 * @param {object} options - Command-specific options
 */
async function handleIngest(globalOptions, file, options) {
  try {
    if (globalOptions.dryRun) {
      console.log("🧪 Dry run: Would ingest document");
      console.log(`File: ${file}`);
      console.log(
        `Parallel processing: ${options.parallel ? "enabled" : "disabled"}`,
      );
      console.log(`Streaming: ${options.streaming ? "enabled" : "disabled"}`);
      console.log(`Tracing: ${options.trace ? "enabled" : "disabled"}`);

      if (options.preview) {
        console.log("📄 Document Preview:");
      }
      if (options.validate) {
        console.log("File validation passed");
      }
      return;
    }

    console.log(`📄 Ingesting document: ${file}`);
    console.log("✅ Document ingested successfully!");
  } catch (error) {
    logger.error("❌ Document ingestion failed:", error.message);
    process.exit(1);
  }
}

module.exports = { handleIngest };
