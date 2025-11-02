'use strict';

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

      // Validate and sanitize LLM output before parsing (security fix)
      let rankingOrder;
      try {
        const parsed = JSON.parse(response);

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
        rankingOrder = [...new Set(validIndices)];

        if (rankingOrder.length === 0) {
          throw new Error('No valid indices in LLM response');
        }
      } catch (parseErr) {
        // Fallback: use simple overlap scoring if parsing fails
        return this._fallbackRerank(query, docs);
      }

      // Apply the ranking order
      const reranked = [];
      for (const index of rankingOrder) {
        reranked.push(docs[index]);
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
