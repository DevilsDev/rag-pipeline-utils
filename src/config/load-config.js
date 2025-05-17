/**
 * Version: 1.2.0
 * Description: Loads and validates RAG pipeline configuration
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
    logger.error(` Missing required configuration file: ${configPath}`);
    throw new Error(`Missing config: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  let config;

  try {
    config = JSON.parse(raw);
  } catch (err) {
    logger.error('Failed to parse JSON configuration.');
    throw new Error('Invalid JSON in config file.');
  }

  validateRagrcSchema(config);
  return config;
}
