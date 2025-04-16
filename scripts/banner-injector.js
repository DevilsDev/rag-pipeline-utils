/**
 * File: scripts/banner-injector.js
 * Description: Script to programmatically inject file-level banners into specified project files
 * Author: Ali Kahwaji
 * Version: 1.0.0
 */

import fs from 'fs';
import path from 'path';
import glob from 'glob';

const banners = {
  '__tests__/unit/reranker/llm-reranker.test.js': `/**
 * File: __tests__/unit/reranker/llm-reranker.test.js
 * Description: Unit and integration tests with mocks for RAG pipeline
 * Author: Ali Kahwaji
 * Version: 1.0.4
 */\n\n`,

  '__tests__/unit/reranker/reranker.snapshot.test.js': `/**
 * File: __tests__/unit/reranker/reranker.snapshot.test.js
 * Description: Snapshot tests for LLM reranker
 * Author: Ali Kahwaji
 * Version: 1.0.4
 */\n\n`,

  '__tests__/unit/core/plugin-registry.test.js': `/**
 * File: __tests__/unit/core/plugin-registry.test.js
 * Description: Unit and integration tests with mocks for RAG pipeline
 * Author: Ali Kahwaji
 * Version: 1.0.4
 */\n\n`,

  '__tests__/integration/config/load-config.test.js': `/**
 * File: __tests__/integration/config/load-config.test.js
 * Description: Unit and integration tests with mocks for RAG pipeline
 * Author: Ali Kahwaji
 * Version: 1.0.4
 */\n\n`,

  '__tests__/integration/cli/config-flow.test.js': `/**
 * File: __tests__/integration/cli/config-flow.test.js
 * Description: Unit and integration tests with mocks for RAG pipeline
 * Author: Ali Kahwaji
 * Version: 1.0.4
 */\n\n`,

  'src/mocks/pdf-loader.js': `/**
 * File: src/mocks/pdf-loader.js
 * Description: Unit and integration tests with mocks for RAG pipeline
 * Author: Ali Kahwaji
 * Version: 1.0.4
 */\n\n`,

  'src/mocks/openai-embedder.js': `/**
 * File: src/mocks/openai-embedder.js
 * Description: Unit and integration tests with mocks for RAG pipeline
 * Author: Ali Kahwaji
 * Version: 1.0.4
 */\n\n`,

  'src/mocks/pinecone-retriever.js': `/**
 * File: src/mocks/pinecone-retriever.js
 * Description: Unit and integration tests with mocks for RAG pipeline
 * Author: Ali Kahwaji
 * Version: 1.0.4
 */\n\n`
};

Object.entries(banners).forEach(([filePath, banner]) => {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    console.warn(`[SKIPPED] ${filePath} does not exist.`);
    return;
  }

  const originalContent = fs.readFileSync(resolvedPath, 'utf-8');

  // Skip if banner already present
  if (originalContent.startsWith('/**')) {
    console.log(`[SKIPPED] ${filePath} already contains a banner.`);
    return;
  }

  const newContent = banner + originalContent;
  fs.writeFileSync(resolvedPath, newContent, 'utf-8');
  console.log(`[INJECTED] Banner added to ${filePath}`);
});
