/**
 * Version: 0.1.0
 * File: /src/mocks/openai-embedder.js
 * Description: Mock implementation of an OpenAI embedder
 * Author: Ali Kahwaji
 */

export class OpenAIEmbedder {
  /**
   * Returns static vector embeddings for input chunks
   * @param {string[]} chunks
   * @returns {Promise<Array<{ id: string, values: number[], metadata: { text: string } }>>}
   */
  async embed(chunks) {
    return chunks.map((text, i) => ({
      id: `v${i}`,
      values: [0.1, 0.2, 0.3],
      metadata: { text },
    }));
  }

  /**
   * Returns a static vector for the given query prompt
   * @param {string} prompt
   * @returns {Promise<number[]>}
   */
  async embedQuery(prompt) {
    return [0.1, 0.2, 0.3];
  }
}