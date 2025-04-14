import { LLMReranker } from '../../../src/reranker/llm-reranker.js';

test('LLMReranker output snapshot', async () => {
  const mockLLM = {
    async generate() {
      return '[1, 0, 2]';
    }
  };
  const mockDocs = [
    { text: 'A' },
    { text: 'B' },
    { text: 'C' }
  ];
  const reranker = new LLMReranker({ llm: mockLLM });
  const result = await reranker.rerank('What is A?', mockDocs);
  expect(result).toMatchSnapshot();
});
