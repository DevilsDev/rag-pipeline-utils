/**
 * Version: 0.1.0
 * File: /src/mocks/pinecone-retriever.js
 * Description: Mock implementation of a Pinecone retriever
 * Author: Ali Kahwaji
 */

class PineconeRetriever {
  constructor(options = {}) {
    this.options = options;
    this.storage = [];

    // Configurable batch size from environment or options
    this.batchSize =
      parseInt(process.env.RAG_RETRIEVER_BATCH_SIZE) ||
      options.batchSize ||
      1000; // Default batch size for Pinecone
  }

  /**
   * Mocks vector storage with batch processing
   * @param {Array} vectors - Vectors to store
   */
  async store(vectors = []) {
    if (!Array.isArray(vectors) || vectors.length === 0) {
      return true;
    }

    // Process storage in batches for better memory management
    for (let i = 0; i < vectors.length; i += this.batchSize) {
      const batch = vectors.slice(i, i + this.batchSize);
      this.storage.push(...batch);

      // Optional progress callback
      if (this.options.onProgress) {
        this.options.onProgress({
          processed: Math.min(i + this.batchSize, vectors.length),
          total: vectors.length,
          stage: "storing",
        });
      }

      // Simulate network delay for large batches
      if (vectors.length > this.batchSize) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }

    return true;
  }

  /**
   * Returns mock retrieved documents with batch processing for large result sets
   * @param {Array} queryVector - Query vector
   * @param {number} k - Number of results to return
   * @returns {Promise<Array<{ id: string, text: string, metadata: object }>>}
   */
  async retrieve(queryVector = [], k = 5) {
    const mockResults = [
      { id: "a", text: "Chunk about pine trees", metadata: {} },
      { id: "b", text: "Chunk about vectors", metadata: {} },
      { id: "c", text: "Chunk about databases", metadata: {} },
      { id: "d", text: "Chunk about machine learning", metadata: {} },
      { id: "e", text: "Chunk about embeddings", metadata: {} },
    ];

    // Extend mock results for large k values
    const results = [];
    for (let i = 0; i < k; i++) {
      const baseResult = mockResults[i % mockResults.length];
      results.push({
        ...baseResult,
        id: `${baseResult.id}_${Math.floor(i / mockResults.length)}`,
        text: `${baseResult.text} (result ${i + 1})`,
      });
    }

    // For large result sets, process in batches
    if (k > this.batchSize) {
      const batchedResults = [];
      for (let i = 0; i < results.length; i += this.batchSize) {
        const batch = results.slice(i, i + this.batchSize);
        batchedResults.push(...batch);

        // Optional progress callback
        if (this.options.onProgress) {
          this.options.onProgress({
            processed: Math.min(i + this.batchSize, results.length),
            total: results.length,
            stage: "retrieving",
          });
        }

        // Simulate network delay for large retrievals
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return batchedResults;
    }

    return results;
  }
}

// Default export

module.exports = PineconeRetriever;
