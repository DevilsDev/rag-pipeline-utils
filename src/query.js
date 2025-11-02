/**
 * Version: 2.0.0
 * Path: /src/query.js
 * Description: Handles querying the RAG pipeline with streaming support
 * Author: Ali Kahwaji
 */

const { createRagPipeline } = require('./core/create-pipeline.js');
// eslint-disable-line global-require
const { loadPluginsFromJson } = require('./config/load-plugin-config.js');
// eslint-disable-line global-require
const { logger } = require('./utils/logger.js');
// eslint-disable-line global-require

/**
 * Query the RAG pipeline with a standard response
 * @param {string} prompt - Query prompt
 * @param {object} config - Pipeline configuration
 * @returns {Promise<string>} Generated response
 */
async function queryPipeline(_prompt, config) {
  if (!prompt) {
    throw new Error('No prompt provided for query.');
  }

  if (!config) {
    throw new Error('No configuration provided for query.');
  }

  try {
    // Load plugins from configuration
    await loadPluginsFromJson(process.cwd());

    // Extract plugin names from config
    const loaderName = Object.keys(config.loader)[0];
    const embedderName = Object.keys(config.embedder)[0];
    const retrieverName = Object.keys(config.retriever)[0];
    const llmName = Object.keys(config.llm)[0];

    // Create pipeline instance
    const pipeline = createRagPipeline(
      {
        loader: loaderName,
        embedder: embedderName,
        retriever: retrieverName,
        llm: llmName,
      },
      {
        useRetry: true,
        useLogging: true,
        useReranker: config.useReranker || false,
      },
    );

    // Execute query
    return await pipeline.query(prompt);
  } catch (error) {
    logger.error('Query pipeline failed', { error: error.message, prompt });
    throw error;
  }
}

/**
 * Query the RAG pipeline with streaming response
 * @param {string} prompt - Query prompt
 * @param {object} config - Pipeline configuration
 * @returns {AsyncIterable<string>} Stream of response tokens
 */
async function* queryPipelineStream(prompt, config) {
  if (!prompt) {
    throw new Error('No prompt provided for streaming query.');
  }

  if (!config) {
    throw new Error('No configuration provided for streaming query.');
  }

  try {
    // Load plugins from configuration
    await loadPluginsFromJson(process.cwd());

    // Extract plugin names from config
    const loaderName = Object.keys(config.loader)[0];
    const embedderName = Object.keys(config.embedder)[0];
    const retrieverName = Object.keys(config.retriever)[0];
    const llmName = Object.keys(config.llm)[0];

    // Create pipeline instance
    const pipeline = createRagPipeline(
      {
        loader: loaderName,
        embedder: embedderName,
        retriever: retrieverName,
        llm: llmName,
      },
      {
        useRetry: true,
        useLogging: true,
        useReranker: config.useReranker || false,
      },
    );

    // Execute streaming query
    yield* pipeline.queryStream(prompt);
  } catch (error) {
    logger.error('Streaming query pipeline failed', {
      error: error.message,
      prompt,
    });
    throw error;
  }
}

module.exports = {
  queryPipeline,
  queryPipelineStream,
};
