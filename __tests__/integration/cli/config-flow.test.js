/**
 * Version: 0.2.1
 * File: __tests__/integration/cli/config-flow.test.js
 * Description: CLI integration tests for config-based fallback with middleware injection support
 * Author: Ali Kahwaji
 */

import { execSync } from 'child_process';
import { resolve } from 'path';
import { copyFileSync } from 'fs';

const CLI_PATH = resolve('bin/cli.js');
const FIXTURE_PDF = resolve('__tests__/fixtures/sample.pdf');
const CONFIG_FIXTURE = resolve('__tests__/fixtures/.ragrc.json');
const ROOT_CONFIG_PATH = resolve('.ragrc.json');

describe('CLI integration with .ragrc.json config fallback', () => {
  beforeAll(() => {
    // Copy test config into root to simulate fallback behavior
    copyFileSync(CONFIG_FIXTURE, ROOT_CONFIG_PATH);
  });

  afterAll(() => {
    // Clean up test config
    try {
      require('fs').unlinkSync(ROOT_CONFIG_PATH);
    } catch (_) {
       // intentionally left empty for fallback coverage
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
      { encoding: 'utf-8' }
    );
    expect(result).toMatch(/Answer:/);
  });
});
