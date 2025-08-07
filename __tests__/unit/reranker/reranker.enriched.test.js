/**
 * File: __tests__/unit/reranker/reranker.enriched.test.js
 * Version: 1.0.0
 * Description: Tests support for extended document structures
 * Author: @devilsdev
 */
const { LLMReranker  } = require('../../../src/reranker/llm-reranker.js');

test('supports documents with metadata', async () => {
    const mockLLM = { async generate() { return '[2, 0, 1]'; } };
    const docs = [
      { text: 'One', source: 'alpha' },
      { text: 'Two', source: 'beta' },
      { text: 'Three', source: 'gamma' }
    ];
    const reranker = new LLMReranker({ llm: mockLLM });
    const result = await reranker.rerank('Choose the most complete', docs);
    expect(result[0]).toHaveProperty('source', 'gamma');
  });