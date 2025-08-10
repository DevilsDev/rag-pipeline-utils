/**
 * Version: 1.3.0
 * Description: Loads and validates RAG pipeline configuration with proper error handling
 * Author: Ali Kahwaji
 */

const fs = require('fs'); // eslint-disable-line global-require
const path = require('path'); // eslint-disable-line global-require
const { fileURLToPath } = require('url'); // eslint-disable-line global-require
const { validateRagrcSchema } = require('./validate-schema.js'); // eslint-disable-line global-require
const { logger } = require('../utils/logger.js'); // eslint-disable-line global-require

const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(fileURLToPath(import.meta.url)); // Reserved for future use
const __dirname = path.dirname(__filename);

const CONFIG_FILENAME = '.ragrc.json';

/**
 * Load and validate a RAG configuration file.
 * @param {string} [cwd=process.cwd()] - Directory to resolve the config from
 * @returns {object} Validated configuration object
 */
function loadRagConfig(cwd = process.cwd()) {
  const configPath = path.resolve(cwd, CONFIG_FILENAME);

  if (!fs.existsSync(configPath)) {
    logger.error(`❌ Config file not found: ${configPath}`);
    throw new Error(`Config file not found: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  let config;

  try {
    config = JSON.parse(raw);
  } catch (err) {
    logger.error('❌ Failed to parse JSON configuration.');
    throw new Error('Invalid JSON in config file.');
  }

  const { valid, errors } = validateRagrcSchema(config);

  if (!valid) {
    logger.error(`❌ Config validation failed:\n${JSON.stringify(errors, null, 2)}`);
    throw new Error('Config validation failed');
  }

  return config;
}

module.exports = {
  loadRagConfig
};
