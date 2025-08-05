/**
 * Parallel processing utilities for RAG pipeline operations
 * Provides configurable concurrency with thread safety and graceful error handling
 */

/**
 * Semaphore for controlling concurrent operations
 */
class Semaphore {
  constructor(maxConcurrency) {
    this.maxConcurrency = maxConcurrency;
    this.currentCount = 0;
    this.waitQueue = [];
  }

  async acquire() {
    if (this.currentCount < this.maxConcurrency) {
      this.currentCount++;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release() {
    this.currentCount--;
    if (this.waitQueue.length > 0) {
      const resolve = this.waitQueue.shift();
      this.currentCount++;
      resolve();
    }
  }
}

/**
 * Parallel processor for embedding operations with configurable concurrency
 */
export class ParallelEmbedder {
  constructor(embedder, options = {}) {
    this.embedder = embedder;
    this.batchSize = options.batchSize || 10;
    this.maxConcurrency = options.maxConcurrency || 3;
    this.retryAttempts = options.retryAttempts || 2;
    this.retryDelay = options.retryDelay || 1000;
  }

  /**
   * Process chunks in parallel batches with concurrency control
   * @param {string[]} chunks - Text chunks to embed
   * @returns {Promise<number[][]>} Array of embedding vectors
   */
  async embedBatch(chunks) {
    if (!Array.isArray(chunks) || chunks.length === 0) {
      throw new Error('Invalid chunks provided. Expected non-empty array.');
    }

    const batches = this.createBatches(chunks, this.batchSize);
    const semaphore = new Semaphore(this.maxConcurrency);
    const results = [];

    // Process batches with controlled concurrency
    const batchPromises = batches.map(async (batch, batchIndex) => {
      await semaphore.acquire();
      
      try {
        const batchResult = await this.processBatchWithRetry(batch, batchIndex);
        return { batchIndex, result: batchResult };
      } finally {
        semaphore.release();
      }
    });

    // Wait for all batches to complete and handle out-of-order resolution
    const batchResults = await Promise.allSettled(batchPromises);
    
    // Process results and handle failures gracefully
    const successfulResults = [];
    const failedBatches = [];

    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successfulResults.push(result.value);
      } else {
        failedBatches.push({
          batchIndex: index,
          error: result.reason,
          chunks: batches[index]
        });
      }
    });

    // Sort results by original batch order to maintain chunk ordering
    successfulResults.sort((a, b) => a.batchIndex - b.batchIndex);

    // Handle failed batches
    if (failedBatches.length > 0) {
      const totalChunks = chunks.length;
      const failedChunkCount = failedBatches.reduce((sum, batch) => sum + batch.chunks.length, 0);
      
      console.warn(`Warning: ${failedBatches.length} batches failed (${failedChunkCount}/${totalChunks} chunks)`);
      
      // If too many batches failed, throw error
      if (failedChunkCount > totalChunks * 0.5) {
        throw new Error(`Parallel embedding failed: ${failedBatches.length} batches failed. First error: ${failedBatches[0].error.message}`);
      }
    }

    // Flatten results while maintaining order
    return successfulResults.flatMap(batch => batch.result);
  }

  /**
   * Process a single batch with retry logic
   * @param {string[]} batch - Batch of chunks to process
   * @param {number} batchIndex - Index of the batch for logging
   * @returns {Promise<number[][]>} Embedding vectors for the batch
   */
  async processBatchWithRetry(batch, batchIndex) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        const result = await this.embedder.embed(batch);
        
        // Validate result
        if (!Array.isArray(result) || result.length !== batch.length) {
          throw new Error(`Embedder returned invalid result for batch ${batchIndex}. Expected ${batch.length} vectors, got ${result?.length || 0}`);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        if (attempt < this.retryAttempts) {
          console.warn(`Batch ${batchIndex} attempt ${attempt + 1} failed, retrying in ${this.retryDelay}ms: ${error.message}`);
          await this.delay(this.retryDelay * (attempt + 1)); // Exponential backoff
        }
      }
    }
    
    throw new Error(`Batch ${batchIndex} failed after ${this.retryAttempts + 1} attempts: ${lastError.message}`);
  }

  /**
   * Create batches from chunks array
   * @param {string[]} items - Items to batch
   * @param {number} size - Batch size
   * @returns {string[][]} Array of batches
   */
  createBatches(items, size) {
    const batches = [];
    for (let i = 0; i < items.length; i += size) {
      batches.push(items.slice(i, i + size));
    }
    return batches;
  }

  /**
   * Delay utility for retry logic
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Parallel processor for retrieval operations
 */
export class ParallelRetriever {
  constructor(retriever, options = {}) {
    this.retriever = retriever;
    this.maxConcurrency = options.maxConcurrency || 2;
    this.chunkQueries = options.chunkQueries || false; // Split complex queries
  }

  /**
   * Process multiple queries in parallel
   * @param {number[][]} queryVectors - Array of query vectors
   * @returns {Promise<any[]>} Retrieved results
   */
  async retrieveBatch(queryVectors) {
    if (!Array.isArray(queryVectors) || queryVectors.length === 0) {
      return [];
    }

    const semaphore = new Semaphore(this.maxConcurrency);
    
    const retrievalPromises = queryVectors.map(async (vector, index) => {
      await semaphore.acquire();
      
      try {
        const result = await this.retriever.retrieve(vector);
        return { index, result };
      } finally {
        semaphore.release();
      }
    });

    const results = await Promise.allSettled(retrievalPromises);
    
    // Process and sort results
    const successfulResults = results
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value)
      .sort((a, b) => a.index - b.index)
      .map(item => item.result);

    return successfulResults;
  }
}

export { Semaphore };
