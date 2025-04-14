#!/usr/bin/env node

/**
 * Version: 0.1.7
 * Path: /bin/cli.js
 * Description: CLI interface for rag-pipeline utilities with loaders, reranker, and evaluation
 * Author: Ali Kahwaji
 */

import { Command } from 'commander';
import { createRagPipeline, registry } from '../src/core/create-pipeline.js';
import { loadRagConfig } from '../src/config/load-config.js';
import { logger } from '../src/utils/logger.js';
import { evaluateRagDataset } from '../src/evaluate/evaluator.js';
import { LLMReranker } from '../src/reranker/llm-reranker.js';

import { MarkdownLoader } from '../src/loader/markdown-loader.js';
import { HTMLLoader } from '../src/loader/html-loader.js';
import { CSVLoader } from '../src/loader/csv-loader.js';
import { DirectoryLoader } from '../src/loader/directory-loader.js';

// Sample/mock plugin implementations
class PDFLoader {
  async load(path) {
    return [{ chunk: () => ['Sample PDF chunk.'] }];
  }
}
class OpenAIEmbedder {
  async embed(chunks) {
    return chunks.map((text, i) => ({
      id: `v${i}`,
      values: [0.1, 0.2, 0.3],
      metadata: { text }
    }));
  }
  async embedQuery(prompt) {
    return [0.1, 0.2, 0.3];
  }
}
class PineconeRetriever {
  async store(vectors) {}
  async retrieve(vector) {
    return [
      { id: 'a', text: 'Chunk about pine trees', metadata: {} },
      { id: 'b', text: 'Chunk about vectors', metadata: {} },
      { id: 'c', text: 'Chunk about databases', metadata: {} }
    ];
  }
}
class OpenAILLM {
  async generate(prompt, context) {
    return `Generated answer using: ${context.map(d => d.text).join(', ')}`;
  }
}

// Register plugins
registry.register('loader', 'pdf', new PDFLoader());
registry.register('loader', 'markdown', new MarkdownLoader());
registry.register('loader', 'html', new HTMLLoader());
registry.register('loader', 'csv', new CSVLoader());
registry.register('loader', 'directory', new DirectoryLoader());
registry.register('embedder', 'openai', new OpenAIEmbedder());
registry.register('retriever', 'pinecone', new PineconeRetriever());
registry.register('llm', 'openai-gpt-4', new OpenAILLM());

const program = new Command();
program
  .name('rag-pipeline')
  .description('CLI for RAG pipeline utilities')
  .version('0.1.7');

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
      const passRate = results.filter(r => r.success).length / results.length;
      const avgBLEU = results.reduce((sum, r) => sum + r.scores.bleu, 0) / results.length;
      const avgROUGE = results.reduce((sum, r) => sum + r.scores.rouge, 0) / results.length;

      results.forEach((r, i) => {
        console.log(
          `\nCase ${i + 1}:\nPrompt: ${r.prompt}\nPass: ${r.success}\nBLEU: ${r.scores.bleu.toFixed(2)}\nROUGE: ${r.scores.rouge.toFixed(2)}`
        );
      });

      console.log(
        `\n Summary:\nPassed: ${Math.round(passRate * 100)}%\nAvg BLEU: ${avgBLEU.toFixed(2)}\nAvg ROUGE: ${avgROUGE.toFixed(2)}`
      );
    } catch (err) {
      logger.error({ error: err.message }, 'Evaluation failed');
      process.exit(1);
    }
  });

program
  .command('rerank')
  .argument('<prompt>', 'Prompt to rerank context for')
  .option('--retriever <type>', 'Retriever type')
  .option('--llm <type>', 'LLM type')
  .action(async (prompt, opts) => {
    try {
      const config = resolveConfig(opts);
      const retriever = registry.get('retriever', config.retriever);
      const llm = registry.get('llm', config.llm);
      const embedder = registry.get('embedder', config.embedder);

      const queryVector = await embedder.embedQuery(prompt);
      const docs = await retriever.retrieve(queryVector);

      const reranker = new LLMReranker({ llm });
      const reranked = await reranker.rerank(prompt, docs);

      console.log('\n Reranked Results:');
      reranked.forEach((doc, i) => {
        console.log(`\n#${i + 1}: ${doc.text}`);
      });
    } catch (err) {
      logger.error({ error: err.message }, 'Rerank failed');
      process.exit(1);
    }
  });

program.parse();
