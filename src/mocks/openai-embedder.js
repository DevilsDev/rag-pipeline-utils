/**
 * Version: 0.1.0
 * File: /src/mocks/openai-embedder.js
 * Description: Mock implementation of an OpenAI embedder
 * Author: Ali Kahwaji
 */

export default class OpenAIEmbedder {
  /**
   * Returns static embeddings for provided documents
   * @param {Array<{ id: string }>} documents
   * @returns {Array<{ id: string, values: number[] }>}
   */
  embed(documents) {
    return documents.map(doc => ({
      id: doc.id,
      values: [0.1, 0.2, 0.3],
    }));
  }

  /**
   * Returns a static embedding for a query string
   * @param {string} query
   * @returns {number[]}
   */
  embedQuery(query) {
    return [0.1, 0.2, 0.3];
  }
}
