/**
 * Sample Embedder Plugin
 * Minimal fixture for test compatibility with configurable batch processing
 */

class SampleEmbedder {
  constructor(options = {}) {
    this.name = "sample-embedder";
    this.version = "1.0.0";
    this.options = options;

    // Configurable batch size from environment or options
    this.batchSize =
      parseInt(process.env.RAG_EMBEDDER_BATCH_SIZE) || options.batchSize || 50; // Default batch size
  }

  async embed(texts) {
    if (!Array.isArray(texts)) {
      return new Array(384).fill(0).map(() => Math.random());
    }

    // Process in batches for better memory management
    const results = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const batchResults = await this._processBatch(batch);
      results.push(...batchResults);

      // Optional progress callback
      if (this.options.onProgress) {
        this.options.onProgress({
          processed: Math.min(i + this.batchSize, texts.length),
          total: texts.length,
          stage: "embedding",
        });
      }
    }

    return results;
  }

  async _processBatch(batch) {
    // Simulate batch processing with slight delay for realism
    await new Promise((resolve) => setTimeout(resolve, 10));
    return batch.map(() => new Array(384).fill(0).map(() => Math.random()));
  }

  async embedQuery(query) {
    return new Array(384).fill(0).map(() => Math.random());
  }
}

module.exports = { SampleEmbedder };
