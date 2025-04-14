/**
 * Version: 0.1.0
 * Path: /__tests__/unit/reranker/llm-reranker.test.js
 * Description: Unit tests for LLM-based context reranker
 * Author: Ali Kahwaji
 */

import { LLMReranker } from '../../../src/reranker/llm-reranker.js';

describe('LLMReranker', () => {
  const mockDocs = [
    { text: 'context about math' },
    { text: 'context about vectors' },
    { text: 'context about nothing' }
  ];

  test('returns reranked documents based on mock LLM JSON output', async () => {
    const mockLLM = {
      async generate() {
        return '[1, 0, 2]';
      }
    };
    const reranker = new LLMReranker({ llm: mockLLM });
    const result = await reranker.rerank('What are vectors?', mockDocs);
    expect(result.map(d => d.text)).toEqual([
      'context about vectors',
      'context about math',
      'context about nothing'
    ]);
  });

  test('gracefully falls back if LLM returns invalid JSON', async () => {
    const mockLLM = {
      async generate() {
        return 'this is not JSON';
      }
    };
    const reranker = new LLMReranker({ llm: mockLLM });
    const result = await reranker.rerank('Explain.', mockDocs);
    expect(result.length).toBe(3);
  });
});
