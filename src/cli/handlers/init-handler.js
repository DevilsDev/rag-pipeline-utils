/**
 * Init command handler
 * Handles RAG pipeline configuration initialization
 */

const fs = require("fs/promises");
const { logger } = require("../../utils/logger.js");

/**
 * Handle init command
 * @param {object} globalOptions - Global CLI options from program.opts()
 * @param {object} options - Command-specific options
 * @param {Function} createBasicConfigFn - Function to create basic config
 */
async function handleInit(globalOptions, options, createBasicConfigFn) {
  try {
    if (globalOptions.dryRun) {
      console.log("🧪 Dry run: Would initialize RAG pipeline configuration");
      console.log(`Output file: ${options.output}`);
      console.log(`Interactive mode: ${!options.noInteractive}`);
      return;
    }

    // Check if config already exists
    if (!options.force) {
      try {
        await fs.access(options.output);
        console.log(`❌ Configuration file already exists: ${options.output}`);
        console.log(
          "Use --force to overwrite or choose a different output path.",
        );
        return;
      } catch (error) {
        // File doesn't exist, which is good
      }
    }

    if (!options.noInteractive) {
      console.log("🧙‍♂️ Starting interactive configuration wizard...\n");
      // Mock interactive wizard
      await createBasicConfigFn(options.output);
    } else {
      await createBasicConfigFn(options.output);
    }
  } catch (error) {
    logger.error("❌ Initialization failed:", error.message);
    process.exit(1);
  }
}

module.exports = { handleInit };
