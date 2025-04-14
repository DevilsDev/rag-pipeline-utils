/**
 * Version: 0.1.2
 * Path: /src/core/create-pipeline.js
 * Description: RAG pipeline factory with retry logic for retriever and LLM
 * Author: Ali Kahwaji
 */

import { PluginRegistry } from './plugin-registry.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

const registry = new PluginRegistry();

export function createRagPipeline({ loader, embedder, retriever, llm }) {
  return {
    async ingest(path) {
      logger.info({ loader, embedder, retriever }, 'Pipeline ingest start');

      const loaderInstance = registry.get('loader', loader);
      const embedderInstance = registry.get('embedder', embedder);
      const retrieverInstance = registry.get('retriever', retriever);

      const documents = await loaderInstance.load(path);
      logger.info({ documentCount: documents.length }, 'Documents loaded');

      const chunks = documents.flatMap(doc => doc.chunk());
      logger.debug({ chunkCount: chunks.length }, 'Chunks created');

      const vectors = await embedderInstance.embed(chunks);
      logger.debug({ vectorCount: vectors.length }, 'Vectors generated');

      await withRetry(() => retrieverInstance.store(vectors), {
        label: 'vector-store',
        retries: 3,
        initialDelay: 500
      });

      logger.info('Ingestion pipeline completed');
    },

    async query(prompt) {
      logger.info({ embedder, retriever, llm, prompt }, 'Pipeline query start');

      const embedderInstance = registry.get('embedder', embedder);
      const retrieverInstance = registry.get('retriever', retriever);
      const llmInstance = registry.get('llm', llm);

      const queryVector = await embedderInstance.embedQuery(prompt);
      logger.debug({ vector: queryVector }, 'Query vector embedded');

      const retrievedDocs = await withRetry(() => retrieverInstance.retrieve(queryVector), {
        label: 'vector-retrieve',
        retries: 3,
        initialDelay: 500
      });

      logger.info({ contextCount: retrievedDocs.length }, 'Context retrieved');

      const result = await withRetry(() => llmInstance.generate(prompt, retrievedDocs), {
        label: 'llm-generate',
        retries: 3,
        initialDelay: 500
      });

      logger.info('LLM response generated');
      return result;
    }
  };
}

export { registry };


