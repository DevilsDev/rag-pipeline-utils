/**
 * Version: 1.0.5
 * Description: Integration test for CLI config fallback with isolated temp directory
 * Author: Ali Kahwaji
 */

import { execSync } from 'child_process';
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  copyFileSync,
} from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

// __dirname compatibility for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

const CLI_PATH = resolve('bin/cli.js');
const TEMP_TEST_DIR = resolve('__tests__/__temp__/cli-config-fallback');
const FIXTURE_PDF = resolve('__tests__/fixtures/sample.pdf');
const FIXTURE_CONFIG = resolve('__tests__/fixtures/.ragrc.json');
const PDF_LOADER_SRC = resolve('__tests__/fixtures/src/mocks/pdf-loader.js');
const EMBEDDER_SRC = resolve('__tests__/fixtures/src/mocks/openai-embedder.js');
const RETRIEVER_SRC = resolve('__tests__/fixtures/src/mocks/pinecone-retriever.js');

describe('CLI integration with .ragrc.json config fallback', () => {
  beforeAll(() => {
    // Setup temp directory
    rmSync(TEMP_TEST_DIR, { recursive: true, force: true });
    mkdirSync(join(TEMP_TEST_DIR, 'src/mocks'), { recursive: true });

    // Copy test input and plugins
    copyFileSync(FIXTURE_PDF, join(TEMP_TEST_DIR, 'sample.pdf'));
    copyFileSync(PDF_LOADER_SRC, join(TEMP_TEST_DIR, 'src/mocks/pdf-loader.js'));
    copyFileSync(EMBEDDER_SRC, join(TEMP_TEST_DIR, 'src/mocks/openai-embedder.js'));
    copyFileSync(RETRIEVER_SRC, join(TEMP_TEST_DIR, 'src/mocks/pinecone-retriever.js'));
    copyFileSync(resolve('__tests__/fixtures/src/mocks/openai-llm.js'), join(TEMP_TEST_DIR, 'src/mocks/openai-llm.js'));


    // Create dynamic config
    const config = {
      loader: './src/mocks/pdf-loader.js',
      embedder: './src/mocks/openai-embedder.js',
      retriever: './src/mocks/pinecone-retriever.js',
      namespace: 'cli-config-test',
      pipeline: ['loader', 'embedder', 'retriever'],
    };

    writeFileSync(
      join(TEMP_TEST_DIR, '.ragrc.json'),
      JSON.stringify(config, null, 2)
    );
  });

  afterAll(() => {
    rmSync(TEMP_TEST_DIR, { recursive: true, force: true });
  });

  test('executes CLI ingest using config fallback', () => {
    const result = execSync(`node ${CLI_PATH} ingest sample.pdf`, {
      cwd: TEMP_TEST_DIR,
      encoding: 'utf-8',
    });
    expect(result).toMatch(/Ingestion complete/);
  });

  test('executes CLI query using config fallback', () => {
    const result = execSync(
      `node ${CLI_PATH} query "What is this test about?"`,
      {
        cwd: TEMP_TEST_DIR,
        encoding: 'utf-8',
      }
    );
    expect(result).toMatch(/Answer:/);
  });
});
