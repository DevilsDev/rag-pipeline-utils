/**
 * Sample Retriever Plugin
 * Minimal fixture for test compatibility with configurable batch processing
 */

class SampleRetriever {
  constructor(options = {}) {
    this.name = 'sample-retriever';
    this.version = '1.0.0';
    this.options = options;
    this.storage = [];

    // Configurable batch size from environment or options
    this.batchSize =
      parseInt(process.env.RAG_RETRIEVER_BATCH_SIZE) ||
      options.batchSize ||
      100; // Default batch size for retrieval
  }

  async store(vectors) {
    // Process storage in batches for better memory management
    if (Array.isArray(vectors) && vectors.length > this.batchSize) {
      for (let i = 0; i < vectors.length; i += this.batchSize) {
        const batch = vectors.slice(i, i + this.batchSize);
        this.storage.push(...batch);

        // Optional progress callback
        if (this.options.onProgress) {
          this.options.onProgress({
            processed: Math.min(i + this.batchSize, vectors.length),
            total: vectors.length,
            stage: 'storing',
          });
        }

        // Small delay to prevent overwhelming memory
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    } else {
      this.storage.push(...vectors);
    }
    return true;
  }

  async retrieve(queryVector, k = 5) {
    // For large result sets, process in batches
    const totalResults = Math.min(k, this.storage.length);
    const results = [];

    for (let i = 0; i < totalResults; i += this.batchSize) {
      const batchSize = Math.min(this.batchSize, totalResults - i);
      const batchResults = this._retrieveBatch(i, batchSize);
      results.push(...batchResults);

      // Optional progress callback
      if (this.options.onProgress && totalResults > this.batchSize) {
        this.options.onProgress({
          processed: Math.min(i + this.batchSize, totalResults),
          total: totalResults,
          stage: 'retrieving',
        });
      }

      // Small delay for large retrievals
      if (totalResults > this.batchSize) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }

    return results;
  }

  _retrieveBatch(startIndex, batchSize) {
    return this.storage
      .slice(startIndex, startIndex + batchSize)
      .map((vector, index) => ({
        content: `Retrieved document ${startIndex + index + 1}`,
        score: Math.random(),
        metadata: { index: startIndex + index },
      }));
  }
}

module.exports = { SampleRetriever };
