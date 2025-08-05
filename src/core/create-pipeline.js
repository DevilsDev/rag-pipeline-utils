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
      try {
        log('info', 'Pipeline ingest start', { loader, embedder, retriever, docPath });

        if (!docPath || typeof docPath !== 'string') {
          throw new Error('Invalid document path provided. Expected non-empty string.');
        }

        const documents = await loaderInstance.load(docPath);
        if (!Array.isArray(documents) || documents.length === 0) {
          throw new Error(`Loader returned no documents from: ${docPath}`);
        }

        const chunks = documents.flatMap(doc => {
          if (!doc || typeof doc.chunk !== 'function') {
            throw new Error('Document object missing required chunk() method');
          }
          return doc.chunk();
        });
        
        if (chunks.length === 0) {
          throw new Error('No text chunks extracted from documents');
        }

        log('info', `Extracted ${chunks.length} chunks from ${documents.length} documents`);

        const vectors = await embedderInstance.embed(chunks);
        if (!Array.isArray(vectors) || vectors.length !== chunks.length) {
          throw new Error(`Embedder returned invalid vectors. Expected ${chunks.length} vectors, got ${vectors?.length || 0}`);
        }

        await wrap(() => retrieverInstance.store(vectors), {
          label: 'vector-store',
          retries: 3,
          initialDelay: 500
        });

        log('info', 'Ingestion pipeline completed successfully');
      } catch (error) {
        log('error', 'Pipeline ingest failed', { error: error.message, docPath });
        throw new Error(`Ingestion failed: ${error.message}`);
      }
    },

    async query(prompt) {
      try {
        log('info', 'Pipeline query start', { prompt, embedder, retriever, llm, useReranker });

        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
          throw new Error('Invalid query prompt. Expected non-empty string.');
        }

        const queryVector = await embedderInstance.embedQuery(prompt);
        if (!Array.isArray(queryVector) || queryVector.length === 0) {
          throw new Error('Embedder failed to generate query vector');
        }

        let retrieved = await wrap(() => retrieverInstance.retrieve(queryVector), {
          label: 'vector-retrieve',
          retries: 3,
          initialDelay: 500
        });

        if (!Array.isArray(retrieved)) {
          throw new Error('Retriever returned invalid results. Expected array.');
        }

        if (retrieved.length === 0) {
          log('warn', 'No documents retrieved for query', { prompt });
        } else {
          log('info', `Retrieved ${retrieved.length} documents for query`);
        }

        if (rerankerInstance) {
          log('info', 'Applying LLM reranker to retrieved chunks');
          retrieved = await wrap(() => rerankerInstance.rerank(prompt, retrieved), {
            label: 'rerank',
            retries: 2,
            initialDelay: 400
          });
          
          if (!Array.isArray(retrieved)) {
            throw new Error('Reranker returned invalid results. Expected array.');
          }
          
          log('info', `Reranker returned ${retrieved.length} documents`);
        }

        const result = await wrap(() => llmInstance.generate(prompt, retrieved), {
          label: 'llm-generate',
          retries: 3,
          initialDelay: 500
        });

        if (!result || typeof result !== 'string') {
          throw new Error('LLM failed to generate a valid response');
        }

        log('info', 'Pipeline query completed successfully');
        return result;
      } catch (error) {
        log('error', 'Pipeline query failed', { error: error.message, prompt });
        throw new Error(`Query failed: ${error.message}`);
      }
    }
  };
}

export { registry };
