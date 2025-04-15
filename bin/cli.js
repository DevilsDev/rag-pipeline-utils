#!/usr/bin/env node

/**
 * Version: 0.1.9
 * Path: /bin/cli.js
 * Description: CLI interface for rag-pipeline utilities with JSON-based plugin registration
 * Author: Ali Kahwaji
 */

import { Command } from 'commander';
import { createRagPipeline, registry } from '../src/core/create-pipeline.js';
import { loadRagConfig } from '../src/config/load-config.js';
import { evaluateRagDataset } from '../src/evaluate/evaluator.js';
import { LLMReranker } from '../src/reranker/llm-reranker.js';
import { logger } from '../src/utils/logger.js';
import { loadPluginsFromJson } from '../src/mocks/load-plugin-config.js';

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load plugin config if available
const pluginConfigPath = resolve(__dirname, '../plugin.config.json');
await loadPluginsFromJson(pluginConfigPath);

const program = new Command();
program
  .name('rag-pipeline')
  .description('CLI for RAG pipeline utilities')
  .version('0.1.9');

/**
 * Loads merged config (file + CLI).
 * @param {object} cliOpts - CLI options
 * @returns {object} - Full resolved configuration
 */
function resolveConfig(cliOpts) {
  try {
    const fileConfig = loadRagConfig();
    return { ...fileConfig, ...cliOpts };
  } catch (err) {
    logger.warn({ error: err.message }, 'Config file fallback failed');
    return cliOpts;
  }
}

// Command: ingest
program
  .command('ingest')
  .argument('<path>', 'Path to document(s)')
  .option('--loader <type>', 'Document loader type')
  .option('--embedder <type>', 'Embedder type')
  .option('--retriever <type>', 'Vector store retriever type')
  .action(async (docPath, opts) => {
    try {
      const config = resolveConfig(opts);
      const pipeline = createRagPipeline(config);
      await pipeline.ingest(docPath);
      console.log('Ingestion complete');
    } catch (err) {
      logger.error({ error: err.message }, 'Ingestion failed');
      console.error('Error during ingestion:', err.message);
      process.exit(1);
    }
  });

// Command: query
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
      logger.error({ error: err.message }, 'Query failed');
      process.exit(1);
    }
  });

// Command: evaluate
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
        console.log(`\nCase ${i + 1}:\nPrompt: ${r.prompt}\nPass: ${r.success}\nBLEU: ${r.scores.bleu.toFixed(2)}\nROUGE: ${r.scores.rouge.toFixed(2)}`);
      });

      console.log(`\n Summary:\nPassed: ${Math.round(passRate * 100)}%\nAvg BLEU: ${avgBLEU.toFixed(2)}\nAvg ROUGE: ${avgROUGE.toFixed(2)}`);
    } catch (err) {
      logger.error({ error: err.message }, 'Evaluation failed');
      process.exit(1);
    }
  });

// Command: rerank
program
  .command('rerank')
  .argument('<prompt>', 'Prompt to rerank context for')
  .option('--retriever <type>', 'Retriever type')
  .option('--llm <type>', 'LLM type')
  .option('--embedder <type>', 'Embedder type')
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
