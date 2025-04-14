/**
 * Version: 0.1.4
 * Path: /bin/cli.js
 * Description: CLI entrypoint with evaluate command for batch prompt assessment
 * Author: Ali Kahwaji
 */

//#!/usr/bin/env node

import { Command } from 'commander';
import { createRagPipeline, registry } from '../src/core/create-pipeline.js';
import { loadRagConfig } from '../src/config/load-config.js';
import { logger } from '../src/utils/logger.js';
import { evaluateRagDataset } from '../src/evaluate/evaluator.js';

import { MarkdownLoader } from '../src/loader/markdown-loader.js';
import { HTMLLoader } from '../src/loader/html-loader.js';

// Mock plugins (to be replaced with real implementations)
class PDFLoader {
  async load(path) {
    logger.info({ path }, 'Loading PDF document');
    return [{ chunk: () => ['Sample PDF chunk.'] }];
  }
}
class OpenAIEmbedder {
  async embed(chunks) {
    return chunks.map((text, i) => ({ id: `v${i}`, values: [0.1, 0.2, 0.3], metadata: { text } }));
  }
  async embedQuery(prompt) {
    return [0.1, 0.2, 0.3];
  }
}
class PineconeRetriever {
  async store(vectors) {
    logger.info({ count: vectors.length }, 'Storing vectors');
  }
  async retrieve(vector) {
    return [{ id: 'v0', text: 'Relevant chunk', metadata: {} }];
  }
}
class OpenAILLM {
  async generate(prompt, context) {
    return `Generated answer using: ${context.map(d => d.text).join(', ')}`;
  }
}

// Register core plugins
registry.register('loader', 'pdf', new PDFLoader());
registry.register('loader', 'markdown', new MarkdownLoader());
registry.register('loader', 'html', new HTMLLoader());
registry.register('embedder', 'openai', new OpenAIEmbedder());
registry.register('retriever', 'pinecone', new PineconeRetriever());
registry.register('llm', 'openai-gpt-4', new OpenAILLM());

const program = new Command();
program
  .name('rag-pipeline')
  .description('CLI for RAG pipeline utilities')
  .version('0.1.4');

function resolveConfig(cliOpts) {
  try {
    const fileConfig = loadRagConfig();
    return { ...fileConfig, ...cliOpts };
  } catch (err) {
    logger.warn({ error: err.message }, 'Config file fallback failed');
    return cliOpts;
  }
}

program
  .command('ingest')
  .argument('<path>', 'Path to document(s)')
  .option('--loader <type>', 'Document loader type')
  .option('--embedder <type>', 'Embedder type')
  .option('--retriever <type>', 'Retriever type')
  .action(async (path, opts) => {
    try {
      const config = resolveConfig(opts);
      const pipeline = createRagPipeline(config);
      await pipeline.ingest(path);
      logger.info('Ingestion complete');
    } catch (err) {
      logger.error({ error: err.message }, 'Ingestion failed');
      process.exit(1);
    }
  });

program
  .command('query')
  .argument('<prompt>', 'Prompt to submit')
  .option('--embedder <type>', 'Embedder type')
  .option('--retriever <type>', 'Retriever type')
  .option('--llm <type>', 'LLM type')
  .action(async (prompt, opts) => {
    try {
      const config = resolveConfig(opts);
      const pipeline = createRagPipeline(config);
      const answer = await pipeline.query(prompt);
      logger.info({ answer }, 'Query complete');
      console.log('\n Answer:\n', answer);
    } catch (err) {
      logger.error({ error: err.message }, 'Query failed');
      process.exit(1);
    }
  });

program
  .command('evaluate')
  .argument('<dataset>', 'Path to JSON file of evaluation cases')
  .option('--embedder <type>', 'Embedder type')
  .option('--retriever <type>', 'Retriever type')
  .option('--llm <type>', 'LLM type')
  .action(async (dataset, opts) => {
    try {
      const config = resolveConfig(opts);
      const results = await evaluateRagDataset(dataset, config);
      const passed = results.filter(r => r.success).length;
      console.log(`\n Evaluation Summary: ${passed}/${results.length} passed`);
    } catch (err) {
      logger.error({ error: err.message }, 'Evaluation failed');
      process.exit(1);
    }
  });

program.parse();

