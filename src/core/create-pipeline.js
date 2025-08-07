/**
 * Version: 0.2.0
 * Path: /src/core/create-pipeline.js
 * Description: RAG pipeline factory with modular retry, logging, and reranker middleware
 * Author: Ali Kahwaji
 */

const registry = require('./plugin-registry.js'); 
const { logger  } = require('../utils/logger.js');
const { withRetry  } = require('../utils/retry.js');
const { LLMReranker  } = require('../reranker/llm-reranker.js');
const { ParallelEmbedder, ParallelRetriever  } = require('./performance/parallel-processor.js');
const { StreamingProcessor  } = require('./performance/streaming-safeguards.js');

/**
 * Pipeline options to toggle middleware.
 * @typedef {Object} PipelineOptions
 * @property {boolean} [useRetry=true] - Enable retry logic on network/storage.
 * @property {boolean} [useLogging=true] - Enable structured logging.
 * @property {boolean} [useReranker=false] - Use reranker for query refinement.
 * @property {boolean} [useParallelProcessing=false] - Enable parallel embedding processing.
 * @property {boolean} [useStreamingSafeguards=false] - Enable streaming memory safeguards.
 * @property {Object} [performance] - Performance configuration options.
 * @property {number} [performance.maxConcurrency=3] - Maximum concurrent operations.
 * @property {number} [performance.batchSize=10] - Batch size for parallel processing.
 * @property {number} [performance.maxMemoryMB=512] - Maximum memory usage in MB.
 * @property {number} [performance.tokenLimit=100000] - Maximum tokens per stream.
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
function createRagPipeline(
  { loader, embedder, retriever, llm },
  { 
    useRetry = true, 
    useLogging = true, 
    useReranker = false,
    useParallelProcessing = false,
    useStreamingSafeguards = false,
    performance = {}
  } = {}
) {
  const loaderInstance = registry.get('loader', loader);
  const baseEmbedderInstance = registry.get('embedder', embedder);
  const baseRetrieverInstance = registry.get('retriever', retriever);
  const llmInstance = registry.get('llm', llm);
  const rerankerInstance = useReranker ? new LLMReranker({ llm: llmInstance }) : null;

  // Performance configuration
  const perfConfig = {
    maxConcurrency: 3,
    batchSize: 10,
    maxMemoryMB: 512,
    tokenLimit: 100000,
    ...performance
  };

  // Wrap instances with performance enhancements if enabled
  const embedderInstance = useParallelProcessing 
    ? new ParallelEmbedder(baseEmbedderInstance, perfConfig)
    : baseEmbedderInstance;
    
  const retrieverInstance = useParallelProcessing
    ? new ParallelRetriever(baseRetrieverInstance, perfConfig)
    : baseRetrieverInstance;
    
  const streamingProcessor = useStreamingSafeguards
    ? new StreamingProcessor(perfConfig)
    : null;

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

        const vectors = useParallelProcessing
          ? await embedderInstance.embedBatch(chunks)
          : await embedderInstance.embed(chunks);
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

    /**
     * Ingest documents with streaming and memory safeguards
     * @param {string} docPath - Path to document
     * @returns {AsyncGenerator} Stream of ingestion progress
     */
    async* ingestStream(docPath) {
      if (!streamingProcessor) {
        throw new Error('Streaming safeguards not enabled. Set useStreamingSafeguards: true in pipeline options.');
      }

      try {
        log('info', 'Pipeline streaming ingest start', { docPath, perfConfig });

        if (!docPath || typeof docPath !== 'string') {
          throw new Error('Invalid document path provided. Expected non-empty string.');
        }

        let totalChunks = 0;
        let processedChunks = 0;
        let failedChunks = 0;

        for await (const result of streamingProcessor.processDocumentStream(docPath, {
          loaderInstance,
          embedderInstance: baseEmbedderInstance,
          retrieverInstance: baseRetrieverInstance
        })) {
          totalChunks++;
          
          if (result.processed) {
            processedChunks++;
            yield {
              type: 'chunk_processed',
              chunk: result.chunk.substring(0, 100) + '...',
              duration: result.duration,
              progress: {
                processed: processedChunks,
                failed: failedChunks,
                total: totalChunks
              },
              memory: streamingProcessor.backpressureController.getStatus().memory
            };
          } else {
            failedChunks++;
            yield {
              type: 'chunk_failed',
              error: result.error,
              chunk: result.chunk.substring(0, 100) + '...',
              progress: {
                processed: processedChunks,
                failed: failedChunks,
                total: totalChunks
              }
            };
          }
        }

        yield {
          type: 'ingest_complete',
          summary: {
            totalChunks,
            processedChunks,
            failedChunks,
            successRate: processedChunks / totalChunks
          }
        };

        log('info', 'Pipeline streaming ingest completed', {
          totalChunks,
          processedChunks,
          failedChunks,
          successRate: processedChunks / totalChunks
        });

      } catch (error) {
        log('error', 'Pipeline streaming ingest failed', { error: error.message, docPath });
        yield {
          type: 'ingest_error',
          error: error.message,
          code: error.code
        };
        throw new Error(`Streaming ingestion failed: ${error.message}`);
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
    },

    /**
     * Query the pipeline with streaming response
     * @param {string} prompt - Query prompt
     * @returns {AsyncIterable<string>} Stream of response tokens
     */
    async* queryStream(prompt) {
      try {
        log('info', 'Pipeline streaming query start', { prompt, embedder, retriever, llm, useReranker });

        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
          throw new Error('Invalid query prompt. Expected non-empty string.');
        }

        // Check if LLM supports streaming
        if (typeof llmInstance.generateStream !== 'function') {
          log('warn', 'LLM does not support streaming, falling back to non-streaming');
          const result = await this.query(prompt);
          yield result;
          return;
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
          log('warn', 'No documents retrieved for streaming query', { prompt });
        } else {
          log('info', `Retrieved ${retrieved.length} documents for streaming query`);
        }

        if (rerankerInstance) {
          log('info', 'Applying LLM reranker to retrieved chunks for streaming');
          retrieved = await wrap(() => rerankerInstance.rerank(prompt, retrieved), {
            label: 'rerank',
            retries: 2,
            initialDelay: 400
          });
          
          if (!Array.isArray(retrieved)) {
            throw new Error('Reranker returned invalid results. Expected array.');
          }
          
          log('info', `Reranker returned ${retrieved.length} documents for streaming`);
        }

        // Stream tokens from LLM
        const stream = llmInstance.generateStream(prompt, retrieved);
        let tokenCount = 0;
        
        for await (const token of stream) {
          if (typeof token !== 'string') {
            log('warn', 'LLM stream returned non-string token', { token });
            continue;
          }
          tokenCount++;
          yield token;
        }

        log('info', 'Pipeline streaming query completed successfully', { tokenCount });
      } catch (error) {
        log('error', 'Pipeline streaming query failed', { error: error.message, prompt });
        throw new Error(`Streaming query failed: ${error.message}`);
      }
    },

    /**
     * Get pipeline configuration and performance settings
     * @returns {object} Pipeline configuration
     */
    getConfig() {
      return {
        plugins: {
          loader,
          embedder,
          retriever,
          llm
        },
        options: {
          useRetry,
          useLogging,
          useReranker,
          useParallelProcessing,
          useStreamingSafeguards
        },
        performance: perfConfig,
        capabilities: {
          streaming: typeof llmInstance.generateStream === 'function',
          parallel: useParallelProcessing,
          safeguards: useStreamingSafeguards,
          reranking: useReranker
        }
      };
    },

    /**
     * Get performance statistics
     * @returns {object} Performance statistics
     */
    getPerformanceStats() {
      const stats = {
        parallel: useParallelProcessing ? {
          maxConcurrency: perfConfig.maxConcurrency,
          batchSize: perfConfig.batchSize
        } : null,
        streaming: useStreamingSafeguards ? streamingProcessor.getStats() : null,
        memory: process.memoryUsage()
      };

      return stats;
    }
  };
}

;


// Default export
module.exports = module.exports || {};


module.exports = {
  createRagPipeline,
  registry
};