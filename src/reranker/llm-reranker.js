'use strict';

// Characters of each document shown to the LLM; keeps the ranking prompt small.
const DEFAULT_MAX_DOC_CHARS = 500;

class LLMReranker {
  constructor(options = {}) {
    this.llm = options.llm;
    this.maxDocChars = options.maxDocChars || DEFAULT_MAX_DOC_CHARS;
  }

  /**
   * Build the instruction sent to the LLM. Documents are numbered from 0 so
   * the response can be validated as indices into `docs`.
   */
  _buildRankingPrompt(query, docs) {
    const listing = docs
      .map((doc, i) => {
        const text = String(doc.text || doc.content || '').slice(
          0,
          this.maxDocChars,
        );
        return `[${i}] ${text.replace(/\s+/g, ' ')}`;
      })
      .join('\n');
    return [
      'Rank the documents below by how relevant they are to the query.',
      'Respond with only a JSON array of document numbers, most relevant',
      'first, for example [2, 0, 1]. Do not include any other text.',
      '',
      `Query: ${query}`,
      '',
      'Documents:',
      listing,
    ].join('\n');
  }

  /**
   * Parse the first JSON array in the response; models often wrap it in
   * prose or a code fence.
   */
  _parseRanking(response) {
    const text = typeof response === 'string' ? response : String(response);
    const match = text.match(/\[[\s\d,]*\]/);
    return JSON.parse(match ? match[0] : text);
  }

  async rerank(query, docs, opts = {}) {
    if (!Array.isArray(docs)) {
      return [];
    }

    // If no LLM provided, fall back to simple overlap scoring
    if (!this.llm) {
      return this._limit(this._fallbackRerank(query, docs), opts);
    }

    try {
      // Ask the LLM for a ranking. Documents are inlined in the prompt, so no
      // separate retrieval context is passed.
      const response = await this.llm.generate(
        this._buildRankingPrompt(query, docs),
        [],
        opts,
      );

      // Validate and sanitize LLM output before parsing (security fix)
      let rankingOrder;
      try {
        const parsed = this._parseRanking(response);

        // Security validation: ensure parsed result is an array
        if (!Array.isArray(parsed)) {
          throw new Error('LLM response is not an array');
        }

        // Security validation: ensure all elements are valid numbers
        if (
          !parsed.every(
            (item) => typeof item === 'number' && Number.isInteger(item),
          )
        ) {
          throw new Error('LLM response contains non-integer values');
        }

        // Security validation: ensure all indices are within valid bounds
        const validIndices = parsed.filter((i) => i >= 0 && i < docs.length);

        // Security validation: remove duplicates to prevent manipulation
        rankingOrder = [...new Set(validIndices)];

        if (rankingOrder.length === 0) {
          throw new Error('No valid indices in LLM response');
        }
      } catch (parseErr) {
        // Fallback: use simple overlap scoring if parsing fails
        return this._limit(this._fallbackRerank(query, docs), opts);
      }

      // Apply the ranking order; documents the LLM left out keep their
      // original relative order after the ranked ones instead of vanishing.
      const ranked = new Set(rankingOrder);
      const reranked = [
        ...rankingOrder.map((index) => docs[index]),
        ...docs.filter((_, index) => !ranked.has(index)),
      ];

      return this._limit(reranked, opts);
    } catch (error) {
      // Fall back to simple overlap scoring on LLM error
      return this._limit(this._fallbackRerank(query, docs), opts);
    }
  }

  _limit(docs, opts) {
    return Number.isInteger(opts.topK) && opts.topK > 0
      ? docs.slice(0, opts.topK)
      : docs;
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
