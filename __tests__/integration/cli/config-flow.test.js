/**
 * Version: 0.2.2
 * File: __tests__/integration/cli/config-flow.test.js
 * Description: CLI integration tests for config-based fallback with middleware injection support
 * Author: Ali Kahwaji
 *
 * Changelog:
 * - 0.2.0: Initial stable fallback CLI test using cwd override
 * - 0.2.1: Improved reliability via root-level config injection and cleanup
 * - 0.2.2: Finalized cleanup handling and directory resolution with __dirname for CI safety
 */

import { execSync } from 'child_process';
import { resolve } from 'path';
import { copyFileSync, unlinkSync } from 'fs';

const CLI_PATH = resolve('bin/cli.js');
const FIXTURE_PDF = resolve('__tests__/fixtures/sample.pdf');
const FIXTURES_DIR = resolve(__dirname, '../../fixtures');
const CONFIG_FIXTURE = resolve('__tests__/fixtures/.ragrc.json');
const ROOT_CONFIG_PATH = resolve('.ragrc.json');

describe('CLI integration with .ragrc.json config fallback', () => {
  beforeAll(() => {
    copyFileSync(CONFIG_FIXTURE, ROOT_CONFIG_PATH);
  });

  afterAll(() => {
    try {
      unlinkSync(ROOT_CONFIG_PATH);
    } catch {
      // Allow file not found errors (already deleted)
    }
  });

  test('executes CLI ingest using config fallback', () => {
    const result = execSync(
      `node ${CLI_PATH} ingest ${FIXTURE_PDF}`,
      { encoding: 'utf-8' }
    );
    expect(result).toMatch(/Ingestion complete/);
  });

  test('executes CLI query using config fallback', () => {
    const result = execSync(
      `node ${CLI_PATH} query "What is this test about?"`,
      {
        encoding: 'utf-8',
        cwd: FIXTURES_DIR,
      }
    );
    expect(result).toMatch(/Answer:/);
  });
});
