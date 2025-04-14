/**
 * Version: 0.1.0
 * Path: /__tests__/integration/config/load-config.test.js
 * Description: Integration tests for loading and validating .ragrc.json config
 * Author: Ali Kahwaji
 */

import fs from 'fs';
import path from 'path';
import { loadRagConfig } from '../../../src/config/load-config.js';

const FIXTURE_PATH = path.resolve(process.cwd(), '.ragrc.json');

const validConfig = {
  loader: 'pdf',
  embedder: 'openai',
  retriever: 'pinecone',
  llm: 'openai-gpt-4',
  chunk: {
    strategy: 'semantic',
    size: 500
  }
};

const invalidConfig = {
  loader: 'pdf',
  chunk: { size: 'large' } // Missing required keys + invalid type
};

describe('loadRagConfig()', () => {
  afterEach(() => {
    if (fs.existsSync(FIXTURE_PATH)) {
      fs.unlinkSync(FIXTURE_PATH);
    }
  });

  test('loads a valid .ragrc.json config file successfully', () => {
    fs.writeFileSync(FIXTURE_PATH, JSON.stringify(validConfig, null, 2));
    const result = loadRagConfig();
    expect(result).toMatchObject(validConfig);
  });

  test('throws validation error for invalid .ragrc.json config', () => {
    fs.writeFileSync(FIXTURE_PATH, JSON.stringify(invalidConfig, null, 2));
    expect(() => loadRagConfig()).toThrow(/Invalid config/);
  });

  test('throws error if config file does not exist', () => {
    expect(() => loadRagConfig()).toThrow(/Config file not found/);
  });
});

