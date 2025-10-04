"use strict";

class LLMReranker {
  constructor(options = {}) {
    this.llm = options.llm;
  }

  async rerank(query, docs, opts = {}) {
    if (!Array.isArray(docs)) {
      return [];
    }

    // If no LLM provided, fall back to simple overlap scoring
    if (!this.llm) {
      return this._fallbackRerank(query, docs);
    }

    try {
      // Use LLM to get reranking order
      const response = await this.llm.generate(query, docs, opts);
      const rankingOrder = JSON.parse(response);

      // Apply the ranking order
      const reranked = [];
      for (const index of rankingOrder) {
        if (index >= 0 && index < docs.length) {
          reranked.push(docs[index]);
        }
      }

      return reranked;
    } catch (error) {
      // Fall back to simple overlap scoring on LLM error
      return this._fallbackRerank(query, docs);
    }
  }

  _fallbackRerank(query, docs) {
    // Simple bag-of-words overlap scoring
    const queryTokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0);

    const scored = docs.map((doc, originalIndex) => {
      const text = doc.text || doc.content || "";
      const docTokens = text
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0);

      // Count overlapping tokens
      let overlap = 0;
      for (const qToken of queryTokens) {
        if (docTokens.includes(qToken)) {
          overlap++;
        }
      }

      // Add tiny length-based tie-break
      const lengthTieBreak = text.length * 0.0001;
      const score = overlap + lengthTieBreak;

      return { doc, score, originalIndex };
    });

    // Sort by score (descending), then by original index (ascending) for stable sort
    scored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.originalIndex - b.originalIndex;
    });

    return scored.map((item) => item.doc);
  }
}

// Create default instance
const defaultInstance = new LLMReranker();

// CJS+ESM interop pattern
module.exports = defaultInstance;
module.exports.LLMReranker = LLMReranker;
module.exports.default = module.exports;
