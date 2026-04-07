/**
 * Run command handler
 * Handles pipeline execution with streaming, abort, and progress support
 */

const { logger } = require("../../utils/logger.js");
const { createProgressBar } = require("../shared/cli-utils.js");

/**
 * Handle run command
 * @param {object} globalOptions - Global CLI options from program.opts()
 * @param {object} options - Command-specific options
 */
async function handleRun(globalOptions, options) {
  if (globalOptions.dryRun) {
    logger.info("🧪 Dry run: Would execute pipeline operation");
    if (options.ingest) logger.info(`Would ingest: ${options.ingest}`);
    if (options.query)
      logger.info(`Would query: ${options.query.substring(0, 100)}...`);
    logger.info(`Streaming: ${options.stream ? "enabled" : "disabled"}`);
    logger.info(`Parallel: ${options.parallel ? "enabled" : "disabled"}`);
    if (options.abortTimeout)
      logger.info(`Abort timeout: ${options.abortTimeout}ms`);
    return;
  }

  try {
    // Load configuration
    const { loadRagConfig } = require("../../config/load-config.js");
    const config = await loadRagConfig(globalOptions.config);

    // Create AbortController for timeout handling
    const abortController = new AbortController();
    let timeoutId;

    if (options.abortTimeout) {
      timeoutId = setTimeout(() => {
        logger.warn(
          `Operation aborted after ${options.abortTimeout}ms timeout`,
        );
        abortController.abort();
      }, options.abortTimeout);
    }

    // Setup SIGINT handling for clean shutdown
    const sigintHandler = () => {
      logger.info("Received SIGINT, aborting operation...");
      abortController.abort();
      if (timeoutId) clearTimeout(timeoutId);
    };
    process.once("SIGINT", sigintHandler);

    try {
      // Create pipeline with performance options
      const { createRagPipeline } = require("../../core/create-pipeline.js");
      const pipeline = createRagPipeline(config.pipeline[0], {
        useParallelProcessing: options.parallel,
        useStreamingSafeguards: options.stream,
        useLogging: true,
        useRetry: true,
      });

      // Execute operation based on options
      if (options.ingest) {
        logger.info(`Starting ingestion of: ${options.ingest}`);

        if (options.stream) {
          let lastProgressTime = Date.now();
          for await (const progress of pipeline.ingestStream(options.ingest)) {
            if (abortController.signal.aborted) {
              logger.info("Ingestion aborted");
              break;
            }

            const now = Date.now();
            if (progress.type === "chunk_processed") {
              // Show progress ticks every 500ms or every 10 chunks
              if (
                now - lastProgressTime > 500 ||
                progress.progress.processed % 10 === 0
              ) {
                const percentage = Math.round(
                  (progress.progress.processed / progress.progress.total) * 100,
                );
                const progressBar = createProgressBar(percentage, 20);
                process.stdout.write(
                  `\r${progressBar} ${percentage}% (${progress.progress.processed}/${progress.progress.total}) `,
                );
                lastProgressTime = now;
              }
            } else if (progress.type === "ingest_complete") {
              process.stdout.write("\n");
              logger.info(
                `✅ Ingestion complete: ${progress.summary.processedChunks}/${progress.summary.totalChunks} chunks processed`,
              );
              if (progress.summary.failedChunks > 0) {
                logger.warn(
                  `⚠️  ${progress.summary.failedChunks} chunks failed`,
                );
              }
            } else if (progress.type === "chunk_failed") {
              process.stdout.write("✗");
            }
          }
        } else {
          // Non-streaming ingestion with progress callback
          let currentStage = "";
          const progressCallback = (progress) => {
            if (progress.stage !== currentStage) {
              if (currentStage) process.stdout.write("\n");
              currentStage = progress.stage;
              logger.info(
                `${progress.stage}: ${progress.message || "Processing..."}`,
              );
            }
            if (
              progress.completed !== undefined &&
              progress.total !== undefined
            ) {
              const percentage = Math.round(
                (progress.completed / progress.total) * 100,
              );
              const progressBar = createProgressBar(percentage, 20);
              process.stdout.write(
                `\r${progressBar} ${percentage}% (${progress.completed}/${progress.total}) `,
              );
            }
          };

          const pipelineWithProgress = createRagPipeline(config.pipeline[0], {
            useParallelProcessing: options.parallel,
            useStreamingSafeguards: false,
            useLogging: true,
            useRetry: true,
            onProgress: progressCallback,
          });

          await pipelineWithProgress.ingest(options.ingest);
          process.stdout.write("\n");
          logger.info("✅ Ingestion completed successfully");
        }
      }

      if (options.query) {
        logger.info(`Executing query: ${options.query.substring(0, 100)}...`);

        if (options.stream) {
          process.stdout.write("\nResponse: ");
          for await (const token of pipeline.queryStream(options.query)) {
            if (abortController.signal.aborted) {
              logger.info("\nQuery aborted");
              break;
            }
            process.stdout.write(token);
          }
          process.stdout.write("\n\n");
        } else {
          const response = await pipeline.query(options.query);
          logger.info("Query completed successfully");
          console.log("\nResponse:", response);
        }
      }

      if (!options.ingest && !options.query) {
        logger.error(
          "No operation specified. Use --ingest <file> or --query <prompt>",
        );
        process.exit(1);
      }
    } finally {
      // Cleanup
      process.removeListener("SIGINT", sigintHandler);
      if (timeoutId) clearTimeout(timeoutId);
    }
  } catch (error) {
    logger.error("Pipeline operation failed", { error: error.message });
    process.exit(1);
  }
}

module.exports = { handleRun };
