"use strict";
/**
 * Minimal ingest surface; wire real backend later.
 */
const path = require("path");
const { logger } = require("./utils/logger.js");

/**
 * Ingest a single document by path.
 * @param {string} filepath - Document path
 * @param {object} config - Configuration object
 * @returns {boolean} - Result (synchronous for now, can be made async later)
 */
function ingestDocument(filepath, config) {
  // Validate document path - always throw synchronously for validation errors
  if (!filepath || typeof filepath !== "string" || filepath.trim() === "") {
    throw new Error("Document path is required");
  }

  // Validate configuration - always throw synchronously for validation errors
  if (!config || typeof config !== "object") {
    throw new Error("Configuration is required");
  }

  // Process document with safer error handling
  try {
    const abs = path.resolve(filepath);
    logger.info({ file: abs }, "ingest:start");

    // TODO: real ingestion (mime sniff, loader selection, vector upsert)
    // For now, return success
    logger.info({ file: abs }, "ingest:complete");
    return true;
  } catch (error) {
    // Log processing errors but don't crash
    logger.error({ file: filepath, error: error.message }, "ingest:error");

    // Re-throw with more context for better debugging
    const enhancedError = new Error(
      `Failed to ingest document '${filepath}': ${error.message}`,
    );
    enhancedError.originalError = error;
    enhancedError.filepath = filepath;
    throw enhancedError;
  }
}

/**
 * Async version of ingestDocument for future use
 * @param {string} filepath - Document path
 * @param {object} config - Configuration object
 * @returns {Promise<boolean>} - Result promise
 */
async function ingestDocumentAsync(filepath, config) {
  // Reuse sync validation and processing
  return ingestDocument(filepath, config);
}

module.exports = { ingestDocument, ingestDocumentAsync };
