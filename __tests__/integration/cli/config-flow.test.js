/**
 * Version: 0.1.3
 * Description: Integration test for CLI with config fallback
 * Author: Ali Kahwaji
 */

import { execSync } from 'child_process';
import path from 'path';

const CLI_PATH = path.resolve('bin/cli.js');

describe('CLI integration with .ragrc.json config fallback', () => {
  test('executes CLI ingest using config fallback', () => {
    const result = execSync(
      `node ${CLI_PATH} ingest ./__tests__/fixtures/sample.pdf --loader pdf --embedder openai --retriever pinecone`,
      { encoding: 'utf-8' }
    );
    expect(result).toContain('Ingestion complete');
  });

  test('executes CLI query using config fallback', () => {
    const result = execSync(
      `node ${CLI_PATH} query "What is this test about?" --embedder openai --retriever pinecone --llm openai-gpt-4`,
      { encoding: 'utf-8' }
    );
    // Adjust expectation to check for a known part of the generated answer
    expect(result).toContain('Generated answer using: Chunk about pine trees');
  });
});
