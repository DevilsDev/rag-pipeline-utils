/**
 * Ingest command handler
 * Loads documents, embeds their chunks and stores them in the configured
 * retriever (file-store persists them for later `query` runs).
 */

const { loadCliConfig } = require("../shared/config-context.js");
const { ingest } = require("../services/rag-service.js");

/**
 * @param {object} globalOptions - Global CLI options from program.opts()
 * @param {string} inputPath - File or directory to ingest
 * @param {object} options - Command-specific options
 */
async function handleIngest(globalOptions, inputPath, options = {}) {
  try {
    const { config, configDir } = loadCliConfig(globalOptions);

    if (globalOptions.dryRun) {
      const { readDocuments } = require("../../loader/document-reader.js");
      const documents = await readDocuments(inputPath, { baseDir: configDir });
      console.log(`🧪 Dry run: would ingest ${documents.length} file(s)`);
      for (const doc of documents) {
        console.log(`  ${doc.source} (${doc.chunks.length} chunks)`);
      }
      return;
    }

    const summary = await ingest({
      config,
      configDir,
      inputPath,
      rebuild: Boolean(options.rebuild),
    });
    console.log(
      `✅ Ingested ${summary.files} file(s), ${summary.chunks} chunk(s). ` +
        `Index now holds ${summary.totalChunks} chunk(s).`,
    );
    if (globalOptions.verbose) {
      for (const source of summary.sources) console.log(`  ${source}`);
    }
  } catch (error) {
    console.error(`❌ Ingestion failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { handleIngest };
