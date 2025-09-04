/**
 * Mock Reranker Plugin
 * Implements: reranker.rerank(query, documents, options)
 */
class MockReranker {
  constructor() {
    this.name = "mock-reranker";
    this.version = "1.0.0";
  }

  /**
   * Reranks documents based on query relevance.
   * @param {string} query - The search query
   * @param {Array<object>} documents - Documents to rerank
   * @param {object} options - Reranking options
   * @param {number} options.topK - Number of top results to return
   * @param {string} options.model - Reranking model to use
   * @param {number} options.threshold - Minimum relevance threshold
   * @returns {Array<object>} Reranked documents with relevance scores
   */
  async rerank(query, documents, options = {}) {
    const docs = Array.isArray(documents) ? documents : [];
    const {
      topK = docs.length,
      model = "mock-reranker-v1",
      threshold = 0.0,
    } = options;
    await new Promise((r) => setTimeout(r, 15));
    return docs
      .map((d, i) => ({
        text: (d && d.text) || d,
        score: d?.score ?? i + 1,
        originalIndex: i,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Calculate query relevance simulation
   * @private
   */
  _calculateQueryRelevance(query, document) {
    const content = (document.content || document.text || "").toLowerCase();
    const queryTerms = query.toLowerCase().split(/\s+/);

    // Simple term matching simulation
    let matches = 0;
    for (const term of queryTerms) {
      if (content.includes(term)) {
        matches++;
      }
    }

    // Base relevance + term matching bonus
    const baseRelevance = 0.5;
    const termBonus = (matches / queryTerms.length) * 0.4;

    return Math.min(0.9, baseRelevance + termBonus);
  }

  /**
   * Get reranker metadata
   */
  getMetadata() {
    return {
      name: this.name,
      version: this.version,
      type: "reranker",
      description: "Mock reranker for testing purposes",
      supportedOptions: ["topK", "model", "threshold"],
    };
  }
}

module.exports = MockReranker;
