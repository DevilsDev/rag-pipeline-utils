/**
 * Version: 0.1.1
 * Path: /src/core/create-pipeline.js
 * Description: Factory function to create a RAG pipeline instance with integrated logging
 * Author: Ali Kahwaji
 */

import { PluginRegistry } from './plugin-registry.js';
import { logger } from '../utils/logger.js';

// Shared singleton instance of plugin registry
const registry = new PluginRegistry();

/**
 * Factory function to construct a RAG pipeline instance.
 *
 * SOLID Compliance:
 * - SRP: Only responsible for composing the pipeline
 * - DIP: Depends on plugin interfaces
 * - OCP: New plugins don't require changes here
 *
 * @param {Object} config - Plugin configuration
 * @param {string} config.loader - Loader plugin name
 * @param {string} config.embedder - Embedder plugin name
 * @param {string} config.retriever - Retriever plugin name
 * @param {string} config.llm - LLM plugin name
 * @returns {Object} - RAG pipeline instance
 */
export function createRagPipeline({ loader, embedder, retriever, llm }) {
  return {
    /**
     * Ingests and processes documents for vector storage
     * @param {string} path - Path to documents
     */
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

      await retrieverInstance.store(vectors);
      logger.info('Ingestion pipeline completed');
    },

    /**
     * Runs query against retriever and returns generated LLM response
     * @param {string} prompt - User prompt
     * @returns {Promise<string>} - LLM-generated answer
     */
    async query(prompt) {
      logger.info({ embedder, retriever, llm, prompt }, 'Pipeline query start');

      const embedderInstance = registry.get('embedder', embedder);
      const retrieverInstance = registry.get('retriever', retriever);
      const llmInstance = registry.get('llm', llm);

      const queryVector = await embedderInstance.embedQuery(prompt);
      logger.debug({ vector: queryVector }, 'Query vector embedded');

      const retrievedDocs = await retrieverInstance.retrieve(queryVector);
      logger.info({ contextCount: retrievedDocs.length }, 'Context retrieved');

      const result = await llmInstance.generate(prompt, retrievedDocs);
      logger.info('LLM response generated');

      return result;
    }
  };
}

export { registry };

