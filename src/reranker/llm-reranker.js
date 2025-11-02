/**
 * Version: 1.0.4
 * Description: LLM reranker using LLM to reorder documents based on relevance
 * Author: devilsdev
 * File: src/reranker/llm-reranker.js
 */

class LLMReranker {
  /**
   * @param {Object} _options
   * @param {{ generate(prompt: string): Promise<string> }} _options.llm - An LLM client with a `generate` method
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

      // Validate and sanitize LLM output before parsing
      let indices;
      try {
        const parsed = JSON.parse(json);

        // Security validation: ensure parsed result is an array
        if (!Array.isArray(parsed)) {
          throw new Error('LLM response is not an array');
        }

        // Security validation: ensure all elements are valid numbers
        if (!parsed.every(item => typeof item === 'number' && Number.isInteger(item))) {
          throw new Error('LLM response contains non-integer values');
        }

        // Security validation: ensure all indices are within valid bounds
        const validIndices = parsed.filter(i => i >= 0 && i < docs.length);

        // Security validation: remove duplicates to prevent manipulation
        indices = [...new Set(validIndices)];

        if (indices.length === 0) {
          throw new Error('No valid indices in LLM response');
        }
      } catch (parseErr) {
        // Fallback: return original document order if parsing fails
        return docs;
      }

      return indices.map(i => docs[i]).filter(Boolean);
    } catch (err) {
      return docs; // Fallback if LLM response is not parsable
    }
  }
}


module.exports = {
  LLMReranker
};