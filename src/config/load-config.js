/**
 * Version: 1.3.0
 * Description: Loads and validates RAG pipeline configuration with proper error handling
 * Author: Ali Kahwaji
 */

const fs = require("fs"); // eslint-disable-line global-require
const path = require("path"); // eslint-disable-line global-require
const { validateRagrc } = require("./enhanced-ragrc-schema.js"); // eslint-disable-line global-require
const { logger } = require("../utils/logger.js"); // eslint-disable-line global-require

// Use CommonJS __dirname (already available in Node.js CommonJS modules)

const CONFIG_FILENAME = ".ragrc.json";

/**
 * Load and validate a RAG configuration file.
 * @param {string} [cwd=process.cwd()] - Directory to resolve the config from
 * @returns {object} Validated configuration object
 */
/**
 * Load and validate .ragrc.json.
 *
 * @param {string} [location=process.cwd()] - A directory containing
 *   .ragrc.json, or the path of a config file (any name ending in .json)
 * @returns {object} Normalized configuration
 */
function loadRagConfig(location = process.cwd()) {
  const configPath = resolveConfigPath(location);

  // Errors are thrown, not logged: callers (e.g. the CLI) report them once.
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, "utf-8");
  let config;

  try {
    config = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Invalid JSON in config file ${configPath}: ${err.message}`,
    );
  }

  const { valid, errors, normalized } = validateRagrc(config);

  if (!valid) {
    const details = (errors || []).map((e) => e.message).join("; ");
    throw new Error(`Config validation failed: ${details}`);
  }

  logger.debug("Configuration loaded", { configPath });
  return normalized;
}

/**
 * @param {string} [location=process.cwd()] - Directory or config file path
 * @returns {string} Absolute path of the config file
 */
function resolveConfigPath(location = process.cwd()) {
  const absolute = path.resolve(location);
  const isFile =
    (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) ||
    absolute.toLowerCase().endsWith(".json");
  return isFile ? absolute : path.join(absolute, CONFIG_FILENAME);
}

module.exports = {
  loadRagConfig,
  resolveConfigPath,
};
