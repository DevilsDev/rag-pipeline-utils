/**
 * Version: 0.1.5
 * Path: /bin/cli.js
 * Description: CLI evaluate command with per-item scores and aggregate metrics
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

// Mock plugins for example use
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
  async store(vectors) {}
  async retrieve(vector) {
    return [{ id: 'v0', text: 'Relevant chunk', metadata: {} }];
  }
}
class OpenAILLM {
  async generate(prompt, context) {
    return `Generated answer using: ${context.map(d => d.text).join(', ')}`;
  }
}

// Plugin registration
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
  .version('0.1.5');

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
      logger.info(' Ingestion complete');
    } catch (err) {
      logger.error({ error: err.message }, ' Ingestion failed');
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

      console.log('\n Evaluation Results:');
      results.forEach(({ prompt, expected, actual, scores, success }, idx) => {
        console.log(`\nCase ${idx + 1}:`);
        console.log(`Prompt:    ${prompt}`);
        console.log(`Expected:  ${expected}`);
        console.log(`Actual:    ${actual}`);
        console.log(`BLEU:      ${scores.bleu.toFixed(2)}`);
        console.log(`ROUGE-L:   ${scores.rouge.toFixed(2)}`);
        console.log(`Pass:      ${success ? 'Yes' : 'No'}`);
      });

      const passRate = results.filter(r => r.success).length / results.length;
      const avgBLEU = results.reduce((sum, r) => sum + r.scores.bleu, 0) / results.length;
      const avgROUGE = results.reduce((sum, r) => sum + r.scores.rouge, 0) / results.length;

      console.log(`\n Summary:`);
      console.log(`Passed:     ${Math.round(passRate * 100)}%`);
      console.log(`Avg BLEU:   ${avgBLEU.toFixed(2)}`);
      console.log(`Avg ROUGE:  ${avgROUGE.toFixed(2)}`);
    } catch (err) {
      logger.error({ error: err.message }, 'Evaluation failed');
      process.exit(1);
    }
  });

program.parse();

