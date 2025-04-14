/**
 * Version: 0.1.0
 * Path: /__tests__/integration/cli/config-flow.test.js
 * Description: Integration tests for CLI fallback to .ragrc.json and full flow execution
 * Author: Ali Kahwaji
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const CONFIG_PATH = path.resolve(process.cwd(), '.ragrc.json');
const CLI_PATH = path.resolve('./bin/cli.js');

const validConfig = {
  loader: 'pdf',
  embedder: 'openai',
  retriever: 'pinecone',
  llm: 'openai-gpt-4',
  chunk: {
    strategy: 'semantic',
    size: 256
  }
};

describe('CLI integration with .ragrc.json config fallback', () => {
  beforeEach(() => {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(validConfig, null, 2));
  });

  afterEach(() => {
    if (fs.existsSync(CONFIG_PATH)) fs.unlinkSync(CONFIG_PATH);
  });

  test('executes CLI ingest using config fallback', () => {
    const result = execSync(`node ${CLI_PATH} ingest ./sample.pdf`, { encoding: 'utf-8' });
    expect(result).toContain('Ingestion complete');
  });

  test('executes CLI query using config fallback', () => {
    const output = execSync(`node ${CLI_PATH} query "What is a vector?"`, { encoding: 'utf-8' });
    expect(output).toContain('Answer:');
  });
});
