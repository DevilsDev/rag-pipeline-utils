/**
 * Version: 1.1.0
 * Description: Loads validated .ragrc.json config from disk
 * Author: Ali Kahwaji
 */

import fs from 'fs';
import path from 'path';
import { validateRagrcSchema } from './validate-schema.js';
import { logger } from '../utils/logger.js';

/**
 * Loads and validates a RAG config file.
 * @param {string} configPath - Absolute path to .ragrc.json
 * @returns {object} Parsed config object
 * @throws {Error} If file is missing or invalid
 */
export function loadRagConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw);

  const result = validateRagrcSchema(parsed);
  if (!result.valid) {
    logger.error({ errors: result.errors }, 'Invalid .ragrc.json schema');
    throw new Error('Config validation failed');
  }

  return parsed;
}
