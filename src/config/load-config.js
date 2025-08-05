/**
 * Version: 1.3.0
 * Description: Loads and validates RAG pipeline configuration with proper error handling
 * Author: Ali Kahwaji
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateRagrcSchema } from './validate-schema.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_FILENAME = '.ragrc.json';

/**
 * Load and validate a RAG configuration file.
 * @param {string} [cwd=process.cwd()] - Directory to resolve the config from
 * @returns {object} Validated configuration object
 */
export function loadRagConfig(cwd = process.cwd()) {
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
