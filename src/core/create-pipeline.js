/**
 * Version: 0.2.0
 * Path: /src/core/create-pipeline.js
 * Description: RAG pipeline factory with modular retry, logging, and reranker middleware
 * Author: Ali Kahwaji
 */

import registry from './plugin-registry.js'; 
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { LLMReranker } from '../reranker/llm-reranker.js';

/**
 * Pipeline options to toggle middleware.
 * @typedef {Object} PipelineOptions
 * @property {boolean} [useRetry=true] - Enable retry logic on network/storage.
 * @property {boolean} [useLogging=true] - Enable structured logging.
 * @property {boolean} [useReranker=false] - Use reranker for query refinement.
 */

/**
 * Creates a RAG pipeline instance.
 * @param {object} config - Pipeline configuration.
 * @param {string} config.loader
 * @param {string} config.embedder
 * @param {string} config.retriever
 * @param {string} config.llm
 * @param {PipelineOptions} [options]
 * @returns {object} RAG pipeline instance
 */
export function createRagPipeline(
  { loader, embedder, retriever, llm },
  { useRetry = true, useLogging = true, useReranker = false } = {}
) {
  const loaderInstance = registry.get('loader', loader);
  const embedderInstance = registry.get('embedder', embedder);
  const retrieverInstance = registry.get('retriever', retriever);
  const llmInstance = registry.get('llm', llm);
  const rerankerInstance = useReranker ? new LLMReranker({ llm: llmInstance }) : null;

  const log = (level, msg, data = {}) => {
    if (useLogging) logger[level](data, msg);
  };

  const wrap = async (fn, context) => {
    return useRetry ? withRetry(fn, context) : fn();
  };

  return {
    async ingest(docPath) {
      log('info', 'Pipeline ingest start', { loader, embedder, retriever });

      const documents = await loaderInstance.load(docPath);
      const chunks = documents.flatMap(doc => doc.chunk());
      const vectors = await embedderInstance.embed(chunks);

      await wrap(() => retrieverInstance.store(vectors), {
        label: 'vector-store',
        retries: 3,
        initialDelay: 500
      });

      log('info', 'Ingestion pipeline completed');
    },

    async query(prompt) {
      log('info', 'Pipeline query start', { prompt, embedder, retriever, llm, useReranker });

      const queryVector = await embedderInstance.embedQuery(prompt);
      let retrieved = await wrap(() => retrieverInstance.retrieve(queryVector), {
        label: 'vector-retrieve',
        retries: 3,
        initialDelay: 500
      });

      if (rerankerInstance) {
        log('info', 'Applying LLM reranker to retrieved chunks');
        retrieved = await wrap(() => rerankerInstance.rerank(prompt, retrieved), {
          label: 'rerank',
          retries: 2,
          initialDelay: 400
        });
      }

      const result = await wrap(() => llmInstance.generate(prompt, retrieved), {
        label: 'llm-generate',
        retries: 3,
        initialDelay: 500
      });

      return result;
    }
  };
}

export { registry };
