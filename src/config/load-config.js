/**
 * Version: 0.1.0
 * Path: /src/config/load-config.js
 * Description: Loader and validator for `.ragrc.json` configuration files
 * Author: Ali Kahwaji
 */

import fs from 'fs';
import path from 'path';
import { validate } from './validate-schema.js';

const DEFAULT_CONFIG_FILE = '.ragrc.json';

/**
 * Load and validate the RAG configuration from a file.
 *
 * @param {string} [configPath] - Optional custom config path
 * @returns {object} - Validated config object
 * @throws {Error} - If file not found or validation fails
 */
export function loadRagConfig(configPath = DEFAULT_CONFIG_FILE) {
  const fullPath = path.resolve(process.cwd(), configPath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Config file not found: ${fullPath}`);
  }

  const raw = fs.readFileSync(fullPath, 'utf-8');
  const config = JSON.parse(raw);

  validate(config); // Throws if invalid

  return config;
}

