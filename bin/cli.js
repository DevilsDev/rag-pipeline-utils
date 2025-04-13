/**
 * Version: 0.1.2
 * Path: /bin/cli.js
 * Description: CLI entrypoint with integrated structured logging
 * Author: Ali Kahwaji
 */

//#!/usr/bin/env node

import { Command } from 'commander';
import { createRagPipeline, registry } from '../src/core/create-pipeline.js';
import { loadRagConfig } from '../src/config/load-config.js';
import { logger } from '../src/utils/logger.js';

// Mock plugins for demonstration
class PDFLoader {
  async load(path) {
    logger.info({ path }, 'Loading document');
    return [{ chunk: () => ['Sample PDF chunk.'] }];
  }
}

class OpenAIEmbedder {
  async embed(chunks) {
    logger.debug({ count: chunks.length }, 'Embedding document chunks');
    return chunks.map((text, i) => ({ id: `v${i}`, values: [0.1, 0.2, 0.3], metadata: { text } }));
  }
  async embedQuery(prompt) {
    logger.debug({ prompt }, 'Embedding query');
    return [0.1, 0.2, 0.3];
  }
}

class PineconeRetriever {
  async store(vectors) {
    logger.info({ count: vectors.length }, 'Storing vectors');
  }
  async retrieve(vector) {
    logger.info({ queryVector: vector }, 'Retrieving context');
    return [{ id: 'v0', text: 'Retrieved context chunk', metadata: {} }];
  }
}

class OpenAILLM {
  async generate(prompt, context) {
    logger.info({ prompt, contextCount: context.length }, 'Generating LLM response');
    return `Generated answer using context: ${context.map(d => d.text).join(', ')}`;
  }
}

// Register test plugins
registry.register('loader', 'pdf', new PDFLoader());
registry.register('embedder', 'openai', new OpenAIEmbedder());
registry.register('retriever', 'pinecone', new PineconeRetriever());
registry.register('llm', 'openai-gpt-4', new OpenAILLM());

const program = new Command();
program
  .name('rag-pipeline')
  .description('CLI for RAG pipeline utilities')
  .version('0.1.2');

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
  .option('--retriever <type>', 'Vector store retriever type')
  .action(async (path, opts) => {
    try {
      const config = resolveConfig(opts);
      logger.info({ config }, 'Starting ingestion');
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
      logger.info({ config }, 'Starting query');
      const pipeline = createRagPipeline(config);
      const answer = await pipeline.query(prompt);
      logger.info({ answer }, 'Query complete');
      console.log('\n Answer:\n', answer);
    } catch (err) {
      logger.error({ error: err.message }, 'Query failed');
      process.exit(1);
    }
  });

program.parse();

