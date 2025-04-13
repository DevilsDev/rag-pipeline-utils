/**
 * Version: 0.1.1
 * Path: /bin/cli.js
 * Description: CLI entrypoint for ingesting documents and querying the RAG pipeline
 * Author: Ali Kahwaji
 */

//#!/usr/bin/env node

import { Command } from 'commander';
import { createRagPipeline, registry } from '../src/core/create-pipeline.js';
import { loadRagConfig } from '../src/config/load-config.js';

/**
 * Register default plugins for demo/testing purposes.
 */
class PDFLoader {
  async load(path) {
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
    console.log(`Stored ${vectors.length} vectors.`);
  }
  async retrieve(vector) {
    return [{ id: 'v0', text: 'Retrieved context chunk', metadata: {} }];
  }
}

class OpenAILLM {
  async generate(prompt, context) {
    return `Generated answer using context: ${context.map(d => d.text).join(', ')}`;
  }
}

// Register mock plugins
registry.register('loader', 'pdf', new PDFLoader());
registry.register('embedder', 'openai', new OpenAIEmbedder());
registry.register('retriever', 'pinecone', new PineconeRetriever());
registry.register('llm', 'openai-gpt-4', new OpenAILLM());

const program = new Command();
program
  .name('rag-pipeline')
  .description('CLI for RAG pipeline utilities')
  .version('0.1.1');

function resolveConfig(cliOpts) {
  try {
    const fileConfig = loadRagConfig();
    return { ...fileConfig, ...cliOpts };
  } catch (err) {
    console.warn(`Config file fallback failed: ${err.message}`);
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
      const pipeline = createRagPipeline(config);
      await pipeline.ingest(path);
      console.log('Ingestion complete');
    } catch (err) {
      console.error('Ingestion failed:', err.message);
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
      console.log('\n Answer:\n', answer);
    } catch (err) {
      console.error('Query failed:', err.message);
      process.exit(1);
    }
  });

program.parse();

