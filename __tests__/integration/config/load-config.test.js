/**
 * Version: 1.1.1
 * Description: Integration tests for loading and validating .ragrc.json via loadRagConfig()
 * Author: Ali Kahwaji
 * File: __tests__/integration/config/load-config.test.js
 */

import fs from 'fs';
import { copyFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { loadRagConfig } from '../../../src/config/load-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

// Fixture paths
const FIXTURE_DIR = resolve(__dirname, '../../fixtures');
const VALID_FIXTURE = join(FIXTURE_DIR, 'valid-ragrc.json');
const INVALID_FIXTURE = join(FIXTURE_DIR, 'invalid-ragrc.json');

// Temp directory used during tests
const TEMP_DIR = resolve('__tests__', '__temp__', 'load-config');
const TEMP_CONFIG = join(TEMP_DIR, '.ragrc.json');

// Ensure fixtures are available before copying
function assertFixturesExist() {
  const required = [VALID_FIXTURE, INVALID_FIXTURE];
  required.forEach(file => {
    if (!existsSync(file)) {
      throw new Error(`❌ Required test fixture missing: ${file}`);
    }
  });
}

describe('loadRagConfig()', () => {
  beforeAll(() => {
    rmSync(TEMP_DIR, { recursive: true, force: true });
    mkdirSync(TEMP_DIR, { recursive: true });

    assertFixturesExist();
  });

  afterAll(() => {
    rmSync(TEMP_DIR, { recursive: true, force: true });
  });

  test('loads a valid .ragrc.json config file successfully', () => {
    copyFileSync(VALID_FIXTURE, TEMP_CONFIG);

    const config = loadRagConfig(TEMP_CONFIG);
    expect(config).toBeDefined();
    expect(config.namespace).toBe('cli-config-test');
    expect(config.loader?.pdf).toBe('./src/mocks/pdf-loader.js');
    expect(config.pipeline).toEqual(expect.arrayContaining(['loader', 'embedder', 'retriever']));
  });

  test('throws validation error for invalid .ragrc.json config', () => {
    copyFileSync(INVALID_FIXTURE, TEMP_CONFIG);
    expect(() => loadRagConfig(TEMP_CONFIG)).toThrow(/Config validation failed/);
  });

  test('throws error if config file does not exist', () => {
    const NON_EXISTENT = join(TEMP_DIR, 'missing.json');
    expect(() => loadRagConfig(NON_EXISTENT)).toThrow(/Config file not found/);
  });
});
