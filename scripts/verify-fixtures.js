/**
 * Version: 1.0.0
 * Description: Script to verify presence of all expected fixture plugins before running integration tests.
 * Author: Ali Kahwaji
 * File: scripts/verify-fixtures.js
 */

import { existsSync } from 'fs';
import { resolve } from 'path';

const REQUIRED_FIXTURES = [
  '__tests__/fixtures/sample.pdf',
  '__tests__/fixtures/.ragrc.json',
  '__tests__/fixtures/src/mocks/pdf-loader.js',
  '__tests__/fixtures/src/mocks/openai-embedder.js',
  '__tests__/fixtures/src/mocks/pinecone-retriever.js',
  '__tests__/fixtures/src/mocks/openai-llm.js'
];

let missing = [];
for (const file of REQUIRED_FIXTURES) {
  const fullPath = resolve(file);
  if (!existsSync(fullPath)) {
    missing.push(fullPath);
  }
}

if (missing.length) {
  console.error('[ERROR] Missing test fixture files:');
  for (const f of missing) {
    console.error(' -', f);
  }
  process.exit(1);
} else {
  console.log('[OK] All fixture files are present.');
}
