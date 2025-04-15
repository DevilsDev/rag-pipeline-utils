/**
 * Version: 0.2.2
 * File: __tests__/integration/cli/config-flow.test.js
 * Description: CLI integration tests for config-based fallback with middleware injection support
 * Author: Ali Kahwaji
 */

import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { copyFileSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';

// Fix for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CLI_PATH = resolve('bin/cli.js');
const FIXTURE_PDF = resolve('__tests__/fixtures/sample.pdf');
const FIXTURES_DIR = resolve(__dirname, '../../fixtures');
const CONFIG_FIXTURE = resolve('__tests__/fixtures/.ragrc.json');
const ROOT_CONFIG_PATH = resolve('.ragrc.json');
const ROOT_PATH = resolve(process.cwd());


describe('CLI integration with .ragrc.json config fallback', () => {
  beforeAll(() => {
    copyFileSync(CONFIG_FIXTURE, ROOT_CONFIG_PATH);
  });

  afterAll(() => {
    try {
      unlinkSync(ROOT_CONFIG_PATH);
    } catch {
      // silent cleanup
    }
  });

  test('executes CLI ingest using config fallback', () => {
    const result = execSync(`node ${CLI_PATH} ingest ./__tests__/fixtures/sample.pdf`, {
      encoding: 'utf-8',
      cwd: ROOT_PATH
    });
    expect(result).toMatch(/Ingestion complete/);
  });

  test('executes CLI query using config fallback', () => {
    const result = execSync(`node ${CLI_PATH} ingest ./__tests__/fixtures/sample.pdf`, {
      encoding: 'utf-8',
      cwd: ROOT_PATH
    });
    expect(result).toMatch(/Answer:/);
  });
});
