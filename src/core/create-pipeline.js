/**
 * Version: 0.1.3
 * Path: /src/core/create-pipeline.js
 * Description: RAG pipeline factory with optional LLM reranker integration
 * Author: Ali Kahwaji
 */

import { PluginRegistry } from './plugin-registry.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { LLMReranker } from '../reranker/llm-reranker.js';

const registry = new PluginRegistry();

/**
 * Create a RAG pipeline instance using registered plugin components
 * @param {object} config
 * @param {string} config.loader
 * @param {string} config.embedder
 * @param {string} config.retriever
 * @param {string} config.llm
 * @param {boolean} [config.useReranker=false]
 * @returns {object} RAG pipeline instance
 */
export function createRagPipeline({ loader, embedder, retriever, llm, useReranker = false }) {
  const rerankerInstance = useReranker ? new LLMReranker({ llm: registry.get('llm', llm) }) : null;

  return {
    async ingest(path) {
      logger.info({ loader, embedder, retriever }, 'Pipeline ingest start');
      const loaderInstance = registry.get('loader', loader);
      const embedderInstance = registry.get('embedder', embedder);
      const retrieverInstance = registry.get('retriever', retriever);

      const documents = await loaderInstance.load(path);
      const chunks = documents.flatMap(doc => doc.chunk());
      const vectors = await embedderInstance.embed(chunks);

      await withRetry(() => retrieverInstance.store(vectors), {
        label: 'vector-store',
        retries: 3,
        initialDelay: 500
      });

      logger.info('Ingestion pipeline completed');
    },

    async query(prompt) {
      logger.info({ prompt, embedder, retriever, llm, useReranker }, 'Pipeline query start');
      const embedderInstance = registry.get('embedder', embedder);
      const retrieverInstance = registry.get('retriever', retriever);
      const llmInstance = registry.get('llm', llm);

      const queryVector = await embedderInstance.embedQuery(prompt);
      let retrieved = await withRetry(() => retrieverInstance.retrieve(queryVector), {
        label: 'vector-retrieve',
        retries: 3,
        initialDelay: 500
      });

      if (rerankerInstance) {
        logger.info('Applying LLM reranker to retrieved chunks');
        retrieved = await withRetry(() => rerankerInstance.rerank(prompt, retrieved), {
          label: 'rerank',
          retries: 2,
          initialDelay: 400
        });
      }

      const result = await withRetry(() => llmInstance.generate(prompt, retrieved), {
        label: 'llm-generate',
        retries: 3,
        initialDelay: 500
      });

      return result;
    }
  };
}

export { registry };

