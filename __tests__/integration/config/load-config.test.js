/**
 * Version: 1.2.0
 * Description: Full validation of loading RAG config with correct folder paths
 * Author: Ali Kahwaji
 */

import { loadRagConfig } from '../../../src/config/load-config.js';
import { mkdirSync, rmSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

const TEMP_DIR = resolve('__tests__/__temp__/load-config');
const VALID_FIXTURE = resolve('__tests__/fixtures/.ragrc.valid.json');
const INVALID_FIXTURE = resolve('__tests__/fixtures/.ragrc.invalid.json');

describe('loadRagConfig()', () => {
  beforeEach(() => {
    rmSync(TEMP_DIR, { recursive: true, force: true });
    mkdirSync(TEMP_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEMP_DIR, { recursive: true, force: true });
  });

  test('loads a valid .ragrc.json config file successfully', () => {
    const target = join(TEMP_DIR, '.ragrc.json');
    copyFileSync(VALID_FIXTURE, target);

    const config = loadRagConfig(TEMP_DIR);
    expect(config).toBeDefined();
    expect(typeof config).toBe('object');
  });

  test('throws validation error for invalid .ragrc.json config', () => {
    const target = join(TEMP_DIR, '.ragrc.json');
    copyFileSync(INVALID_FIXTURE, target);

    expect(() => loadRagConfig(TEMP_DIR)).toThrow(/Config validation failed/);
  });

  test('throws error if config folder does not contain .ragrc.json', () => {
    const NON_EXISTENT_DIR = resolve('__tests__/__temp__/load-config-missing');

    // Ensure the folder really doesn't exist
    if (existsSync(NON_EXISTENT_DIR)) {
      rmSync(NON_EXISTENT_DIR, { recursive: true, force: true });
    }

    expect(() => loadRagConfig(NON_EXISTENT_DIR)).toThrow(/Config file not found/);
  });
});
