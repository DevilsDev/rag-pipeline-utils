/**
 * Mock Reranker Plugin
 * Implements: reranker.rerank(query, documents, options)
 */
export default class MockReranker {
  constructor() {
    this.name = 'mock-reranker';
    this.version = '1.0.0';
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
    const { topK = documents.length, model = 'mock-reranker-v1', threshold = 0.0 } = options;
    
    // Simulate async reranking
    await new Promise(resolve => setTimeout(resolve, 15));
    
    if (!Array.isArray(documents) || documents.length === 0) {
      return [];
    }
    
    // Simulate reranking with deterministic scoring based on content
    const rerankedDocs = documents.map((doc, index) => {
      // Simple scoring: longer content gets higher score, with some query relevance simulation
      const contentLength = (doc.content || doc.text || '').length;
      const queryRelevance = this._calculateQueryRelevance(query, doc);
      const positionPenalty = index * 0.01; // Slight penalty for original position
      
      const relevanceScore = Math.min(0.95, 
        (queryRelevance * 0.7) + 
        (Math.min(contentLength / 1000, 0.3) * 0.3) - 
        positionPenalty
      );
      
      return {
        ...doc,
        relevanceScore: Math.max(0.1, relevanceScore), // Minimum score of 0.1
        originalIndex: index,
        rerankedBy: model
      };
    });
    
    // Filter by threshold and sort by relevance score
    const filteredDocs = rerankedDocs
      .filter(doc => doc.relevanceScore >= threshold)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    // Return top K results
    return filteredDocs.slice(0, topK);
  }
  
  /**
   * Calculate query relevance simulation
   * @private
   */
  _calculateQueryRelevance(query, document) {
    const content = (document.content || document.text || '').toLowerCase();
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
      type: 'reranker',
      description: 'Mock reranker for testing purposes',
      supportedOptions: ['topK', 'model', 'threshold']
    };
  }
}
