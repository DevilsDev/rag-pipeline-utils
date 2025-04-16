/**
 * Version: 1.0.4
 * Description: LLM reranker using LLM to reorder documents based on relevance
 * Author: devilsdev
 * File: src/reranker/llm-reranker.js
 */

export class LLMReranker {
  /**
   * @param {Object} options
   * @param {{ generate(prompt: string): Promise<string> }} options.llm - An LLM client with a `generate` method
   */
  constructor({ llm }) {
    this.llm = llm;
  }

  /**
   * Rerank documents based on the LLM output
   * @param {string} query
   * @param {Array<{ text: string }>} docs
   * @returns {Promise<Array<{ text: string }>>}
   */
  async rerank(query, docs) {
    const prompt = `Given the query: "${query}", rank the following documents by relevance: \n${docs.map((d, i) => `[${i}]: ${d.text}`).join('\n')}\nReturn an array of indices like [2, 0, 1]`;

    try {
      const json = await this.llm.generate(prompt);
      const indices = JSON.parse(json);
      return indices.map(i => docs[i]).filter(Boolean);
    } catch (err) {
      return docs; // Fallback if LLM response is not parsable
    }
  }
}
