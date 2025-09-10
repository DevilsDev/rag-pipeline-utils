'use strict';

class LLMReranker {
  rerank(query, docs, opts = {}) {
    if (!Array.isArray(docs)) {
      return [];
    }

    // Simple bag-of-words overlap scoring
    const queryTokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0);

    const scored = docs.map((doc, originalIndex) => {
      const text = doc.text || doc.content || '';
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
