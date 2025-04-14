/**
 * Version: 0.1.0
 * Path: /src/reranker/llm-reranker.js
 * Description: LLM-based reranker that reorders retrieved context for relevance
 * Author: Ali Kahwaji
 */

/**
 * LLMReranker ranks context chunks by relevance to a given prompt.
 * @interface
 */
export class LLMReranker {
    constructor({ llm }) {
      if (!llm || typeof llm.generate !== 'function') {
        throw new Error('LLM instance must implement generate(prompt, context)');
      }
      this.llm = llm;
    }
  
    /**
     * Reranks retrieved context chunks using the LLM.
     * @param {string} prompt - The user's question or query
     * @param {Array<{ text: string, metadata?: object }>} documents - Retrieved context chunks
     * @param {number} [topK=5] - Number of top-ranked documents to return
     * @returns {Promise<Array>} - Reranked top K chunks
     */
    async rerank(prompt, documents, topK = 5) {
      const contextText = documents.map((d, i) => `Chunk ${i + 1}: ${d.text}`).join('\n');
  
      const instruction = `Rank the following document chunks by how well they answer the prompt.\n
  Prompt: ${prompt}\n
  Chunks:\n${contextText}\n
  Respond with a JSON array of chunk indexes in descending order of relevance.`;
  
      const result = await this.llm.generate(instruction, []);
  
      let indexOrder = [];
      try {
        indexOrder = JSON.parse(result.match(/\[.*\]/s)?.[0] || '[]');
      } catch (err) {
        console.warn('Failed to parse reranker output:', result);
        return documents.slice(0, topK); // fallback
      }
  
      const ranked = indexOrder.map(i => documents[i]).filter(Boolean);
      return ranked.slice(0, topK);
    }
  }
  