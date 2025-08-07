/**
 * File: __tests__/unit/reranker/reranker.structured-output.test.js
 * Version: 1.0.0
 * Description: Validates structured LLM output parsing
 * Author: @devilsdev
 */
const { LLMReranker  } = require('../../../src/reranker/llm-reranker.js');

test('parses structured LLM JSON result', async () => {
    const mockLLM = { async generate() {
      return JSON.stringify({ ranking: [0, 2, 1] });
    }};
    const docs = [{ text: 'Alpha' }, { text: 'Beta' }, { text: 'Gamma' }];
    const reranker = new LLMReranker({ llm: mockLLM });
    const result = await reranker.rerank('Which is alpha?', docs);
    expect(result[0].text).toBe('Alpha');
  });