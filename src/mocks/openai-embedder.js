/**
 * Version: 2.0.0
 * Description: Mock implementation of OpenAI embedder for testing and development
 * Author: Ali Kahwaji
 */

class OpenAIEmbedder {
  constructor(options = {}) {
    this.apiKey = options.apiKey || 'mock-api-key';
    this.model = options.model || 'text-embedding-ada-002';
    this.dimensions = options.dimensions || 1536;
  }

  /**
   * Generate embeddings for an array of text chunks
   * @param {string[]} chunks - Array of text chunks to embed
   * @returns {Promise<number[][]>} Array of embedding vectors
   */
  async embed(chunks) {
    if (!Array.isArray(chunks)) {
      throw new Error('embed() expects an array of strings');
    }

    // Return mock embeddings - deterministic based on content for testing
    return chunks.map(chunk => this.#generateMockEmbedding(chunk));
  }

  /**
   * Generate embedding for a single query string
   * @param {string} query - Query string to embed
   * @returns {Promise<number[]>} Embedding vector
   */
  async embedQuery(query) {
    if (typeof query !== 'string') {
      throw new Error('embedQuery() expects a string');
    }

    return this.#generateMockEmbedding(query);
  }

  /**
   * Generate a deterministic mock embedding based on input text
   * @private
   * @param {string} text - Input text
   * @returns {number[]} Mock embedding vector
   */
  #generateMockEmbedding(text) {
    // Create deterministic "embedding" based on text content
    const hash = this.#simpleHash(text);
    const embedding = [];
    
    for (let i = 0; i < this.dimensions; i++) {
      // Generate pseudo-random values based on hash and index
      const value = Math.sin(hash + i) * 0.5;
      embedding.push(value);
    }
    
    return embedding;
  }

  /**
   * Simple hash function for deterministic mock data
   * @private
   * @param {string} str - Input string
   * @returns {number} Hash value
   */
  #simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }
}

// Export default instance for easy use
 OpenAIEmbedder();


// Default export



module.exports = {
  OpenAIEmbedder
};