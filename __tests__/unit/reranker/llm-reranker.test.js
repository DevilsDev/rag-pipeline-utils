/**
 * File: __tests__/unit/reranker/llm-reranker.test.js
 * Version: 1.0.0
 * Description: Validates core behavior of the LLMReranker module
 * Author: @devilsdev
 */

const { LLMReranker  } = require('../../../src/reranker/llm-reranker.js');

describe('LLMReranker', () => {
  test('returns reranked documents based on mock LLM JSON output', async () => {
    const mockLLM = { async generate() { return '[1, 0, 2]'; } };
    const docs = [{ text: 'A' }, { text: 'B' }, { text: 'C' }];
    const reranker = new LLMReranker({ llm: mockLLM });
    const result = await reranker.rerank('What is A?', docs);
    expect(result.map(d => d.text)).toEqual(['B', 'A', 'C']);
  });
});