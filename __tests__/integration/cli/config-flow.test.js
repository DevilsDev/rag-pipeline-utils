/**
 * Version: 1.1.0
 * Description: Final CLI config fallback integration test with fixture mock copying and validation
 * Author: Ali Kahwaji
 */

import { execSync } from 'child_process';
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync
} from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

const CLI_PATH = resolve('bin/cli.js');
const TEMP_TEST_DIR = resolve('__tests__/__temp__/cli-config-fallback');
const FIXTURE_CONFIG = join(TEMP_TEST_DIR, '.ragrc.json');
const FIXTURE_PDF = resolve('__tests__/fixtures/sample.pdf');

// Fixture sources
const FIXTURE_SRC = resolve('__tests__/fixtures/src/mocks');
const PDF_LOADER_SRC = join(FIXTURE_SRC, 'pdf-loader.js');
const EMBEDDER_SRC = join(FIXTURE_SRC, 'openai-embedder.js');
const RETRIEVER_SRC = join(FIXTURE_SRC, 'pinecone-retriever.js');
const LLM_SRC = join(FIXTURE_SRC, 'openai-llm.js');

const FIXTURE_CONFIG_OBJECT = {
  loader: { pdf: './src/mocks/pdf-loader.js' },
  embedder: { openai: './src/mocks/openai-embedder.js' },
  retriever: { pinecone: './src/mocks/pinecone-retriever.js' },
  llm: { openai: './src/mocks/openai-llm.js' },
  namespace: 'cli-config-test',
  pipeline: ['loader', 'embedder', 'retriever']
};

describe('CLI integration with .ragrc.json config fallback', () => {
  beforeAll(() => {
    rmSync(TEMP_TEST_DIR, { recursive: true, force: true });
    mkdirSync(join(TEMP_TEST_DIR, 'src/mocks'), { recursive: true });

    // Assert existence
    [FIXTURE_PDF, PDF_LOADER_SRC, EMBEDDER_SRC, RETRIEVER_SRC, LLM_SRC].forEach(file => {
      if (!existsSync(file)) throw new Error(`[FATAL] Missing required fixture: ${file}`);
    });

    // Copy fixture PDF
    copyFileSync(FIXTURE_PDF, join(TEMP_TEST_DIR, 'sample.pdf'));

    // Copy mock plugins into temp dir
    copyFileSync(PDF_LOADER_SRC, join(TEMP_TEST_DIR, 'src/mocks/pdf-loader.js'));
    copyFileSync(EMBEDDER_SRC, join(TEMP_TEST_DIR, 'src/mocks/openai-embedder.js'));
    copyFileSync(RETRIEVER_SRC, join(TEMP_TEST_DIR, 'src/mocks/pinecone-retriever.js'));
    copyFileSync(LLM_SRC, join(TEMP_TEST_DIR, 'src/mocks/openai-llm.js'));

    // Write valid .ragrc.json
    writeFileSync(FIXTURE_CONFIG, JSON.stringify(FIXTURE_CONFIG_OBJECT, null, 2));

    console.debug('[DEBUG] .ragrc.json contents:\n', JSON.stringify(FIXTURE_CONFIG_OBJECT, null, 2));
    console.debug('[SETUP] Temp dir:', TEMP_TEST_DIR);
    console.debug('[SETUP] Contents:', readdirSync(TEMP_TEST_DIR));
  });

  afterAll(() => {
    rmSync(TEMP_TEST_DIR, { recursive: true, force: true });
  });

  test('validates plugin sections contain resolvable names', () => {
    const config = JSON.parse(readFileSync(FIXTURE_CONFIG, 'utf-8'));
    ['loader', 'embedder', 'retriever', 'llm'].forEach(type => {
      expect(typeof config[type]).toBe('object');
      expect(Object.keys(config[type]).length).toBeGreaterThan(0);
    });
  });

  test('executes CLI ingest using config fallback', () => {
    const result = execSync(`node ${CLI_PATH} ingest sample.pdf`, {
      cwd: TEMP_TEST_DIR,
      encoding: 'utf-8'
    });
    expect(result).toMatch(/Ingestion complete/);
  });

  test('executes CLI query using config fallback', () => {
    const result = execSync(`node ${CLI_PATH} query "What is this test about?"`, {
      cwd: TEMP_TEST_DIR,
      encoding: 'utf-8'
    });
    expect(result).toMatch(/Answer:/);
  });
});
