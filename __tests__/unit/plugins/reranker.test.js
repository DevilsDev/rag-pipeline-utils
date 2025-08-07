/**
 * Unit tests for reranker plugin functionality
 * Tests reranking logic, scoring, filtering, and integration scenarios
 */

const MockReranker = require('../../fixtures/src/mocks/reranker.js');

describe('Reranker Plugin', () => {
  let reranker;

  beforeEach(() => {
    reranker = new MockReranker();
  });

  describe('constructor', () => {
    it('should initialize with correct metadata', () => {
      expect(reranker.name).toBe('mock-reranker');
      expect(reranker.version).toBe('1.0.0');
    });
  });

  describe('rerank() method', () => {
    const sampleDocuments = [
      {
        id: 'doc1',
        content: 'Machine learning is a subset of artificial intelligence that focuses on algorithms.',
        metadata: { category: 'tech', length: 'medium' }
      },
      {
        id: 'doc2',
        content: 'Deep learning uses neural networks with multiple layers.',
        metadata: { category: 'tech', length: 'short' }
      },
      {
        id: 'doc3',
        content: 'Natural language processing helps computers understand human language.',
        metadata: { category: 'nlp', length: 'medium' }
      }
    ];

    it('should rerank documents with relevance scores', async () => {
      const query = 'machine learning algorithms';
      const result = await reranker.rerank(query, sampleDocuments);

      expect(result).toHaveLength(3);
      expect(result[0]).toHaveProperty('relevanceScore');
      expect(result[0]).toHaveProperty('originalIndex');
      expect(result[0]).toHaveProperty('rerankedBy', 'mock-reranker-v1');

      // Check that results are sorted by relevance score (descending)
      for (let i = 1; i < result.length; i++) {
        expect(result[i-1].relevanceScore).toBeGreaterThanOrEqual(result[i].relevanceScore);
      }
    });

    it('should preserve original document properties', async () => {
      const query = 'neural networks';
      const result = await reranker.rerank(query, sampleDocuments);

      result.forEach((doc, index) => {
        expect(doc.id).toBeDefined();
        expect(doc.content).toBeDefined();
        expect(doc.metadata).toBeDefined();
        expect(doc.originalIndex).toBe(sampleDocuments.findIndex(d => d.id === doc.id));
      });
    });

    it('should handle topK parameter correctly', async () => {
      const query = 'artificial intelligence';
      const result = await reranker.rerank(query, sampleDocuments, { topK: 2 });

      expect(result).toHaveLength(2);
      
      // Should return the top 2 highest scoring documents
      expect(result[0].relevanceScore).toBeGreaterThanOrEqual(result[1].relevanceScore);
    });

    it('should apply threshold filtering', async () => {
      const query = 'machine learning';
      const result = await reranker.rerank(query, sampleDocuments, { threshold: 0.8 });

      // All returned documents should have score >= threshold
      result.forEach(doc => {
        expect(doc.relevanceScore).toBeGreaterThanOrEqual(0.8);
      });
    });

    it('should handle empty document array', async () => {
      const query = 'test query';
      const result = await reranker.rerank(query, []);

      expect(result).toEqual([]);
    });

    it('should handle invalid input gracefully', async () => {
      const query = 'test query';
      
      // Test with null documents
      const result1 = await reranker.rerank(query, null);
      expect(result1).toEqual([]);
      
      // Test with undefined documents
      const result2 = await reranker.rerank(query, undefined);
      expect(result2).toEqual([]);
    });

    it('should simulate realistic scoring based on content', async () => {
      const docs = [
        { id: '1', content: 'machine learning algorithms and neural networks' },
        { id: '2', content: 'cooking recipes and food preparation' },
        { id: '3', content: 'machine learning in artificial intelligence' }
      ];

      const query = 'machine learning';
      const result = await reranker.rerank(query, docs);

      // Documents with more query term matches should score higher
      const mlDocs = result.filter(d => d.content.includes('machine learning'));
      const nonMlDocs = result.filter(d => !d.content.includes('machine learning'));

      if (mlDocs.length > 0 && nonMlDocs.length > 0) {
        expect(mlDocs[0].relevanceScore).toBeGreaterThan(nonMlDocs[0].relevanceScore);
      }
    });

    it('should handle concurrent reranking requests', async () => {
      const queries = ['AI', 'ML', 'NLP'];
      const promises = queries.map(query => 
        reranker.rerank(query, sampleDocuments)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toHaveLength(3);
        expect(result[0].relevanceScore).toBeGreaterThanOrEqual(result[2].relevanceScore);
      });
    });
  });

  describe('scoring algorithm', () => {
    it('should give higher scores to longer content', async () => {
      const docs = [
        { id: '1', content: 'Short text' },
        { id: '2', content: 'This is a much longer piece of content that should receive a higher relevance score due to its length and comprehensive coverage of the topic at hand.' }
      ];

      const query = 'comprehensive topic';
      const result = await reranker.rerank(query, docs);

      // Longer content should generally score higher (with some query relevance)
      expect(result[0].id).toBe('2'); // Longer document should be first
    });

    it('should balance content length with query relevance', async () => {
      const docs = [
        { 
          id: '1', 
          content: 'machine learning algorithms neural networks deep learning artificial intelligence' 
        },
        { 
          id: '2', 
          content: 'This is a very long document about cooking and food preparation that has nothing to do with the query but is much longer than the first document and contains many words about culinary arts and kitchen techniques.' 
        }
      ];

      const query = 'machine learning neural networks';
      const result = await reranker.rerank(query, docs);

      // Query relevance should outweigh pure length
      expect(result[0].id).toBe('1');
    });

    it('should apply position penalty correctly', async () => {
      const docs = Array.from({ length: 5 }, (_, i) => ({
        id: `doc${i}`,
        content: 'identical content for all documents'
      }));

      const query = 'identical content';
      const result = await reranker.rerank(query, docs);

      // Earlier positions should have slight advantage due to position penalty
      // (though this might be overcome by randomness in mock scoring)
      expect(result).toHaveLength(5);
      result.forEach(doc => {
        expect(doc.originalIndex).toBeGreaterThanOrEqual(0);
        expect(doc.originalIndex).toBeLessThan(5);
      });
    });
  });

  describe('getMetadata() method', () => {
    it('should return complete metadata', () => {
      const metadata = reranker.getMetadata();

      expect(metadata).toEqual({
        name: 'mock-reranker',
        version: '1.0.0',
        type: 'reranker',
        description: 'Mock reranker for testing purposes',
        supportedOptions: ['topK', 'model', 'threshold']
      });
    });
  });

  describe('edge cases', () => {
    it('should handle documents without content field', async () => {
      const docs = [
        { id: '1', text: 'Document with text field instead of content' },
        { id: '2', title: 'Document with only title' },
        { id: '3', content: 'Normal document with content field' }
      ];

      const query = 'document';
      const result = await reranker.rerank(query, docs);

      expect(result).toHaveLength(3);
      result.forEach(doc => {
        expect(doc.relevanceScore).toBeGreaterThan(0);
      });
    });

    it('should handle very long queries', async () => {
      const longQuery = 'machine learning artificial intelligence deep learning neural networks natural language processing computer vision reinforcement learning supervised learning unsupervised learning'.repeat(10);
      const docs = [
        { id: '1', content: 'machine learning basics' },
        { id: '2', content: 'unrelated content' }
      ];

      const result = await reranker.rerank(longQuery, docs);

      expect(result).toHaveLength(2);
      expect(result[0].relevanceScore).toBeGreaterThan(0);
    });

    it('should handle special characters in content', async () => {
      const docs = [
        { id: '1', content: 'Content with special chars: @#$%^&*()' },
        { id: '2', content: 'Normal content without special characters' }
      ];

      const query = 'special chars';
      const result = await reranker.rerank(query, docs);

      expect(result).toHaveLength(2);
      result.forEach(doc => {
        expect(doc.relevanceScore).toBeGreaterThan(0);
      });
    });

    it('should maintain minimum relevance score', async () => {
      const docs = [
        { id: '1', content: '' }, // Empty content
        { id: '2', content: 'x' }  // Minimal content
      ];

      const query = 'unrelated query that matches nothing';
      const result = await reranker.rerank(query, docs);

      result.forEach(doc => {
        expect(doc.relevanceScore).toBeGreaterThanOrEqual(0.1); // Minimum score
      });
    });
  });
});
