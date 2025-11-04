/**
 * Valid Embedder Plugin - Fully compliant with embedder contract
 */

class ValidEmbedderPlugin {
  constructor() {
    this.name = "Valid Embedder Plugin";
    this.version = "1.0.0";
    this.type = "embedder";
  }

  /**
   * Generate embeddings for text chunks
   * @param {Array} chunks - Array of chunks with id and content
   * @returns {Promise<Array>} Array of vectors
   */
  async embed(chunks) {
    return chunks.map((chunk) => ({
      id: chunk.id,
      vector: Array(384)
        .fill(0)
        .map(() => Math.random()), // Mock 384-dim vector
    }));
  }
}

module.exports = ValidEmbedderPlugin;
