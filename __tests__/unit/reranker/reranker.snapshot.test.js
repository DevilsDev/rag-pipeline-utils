/**
 * File: __tests__/unit/reranker/reranker.snapshot.test.js
 * Version: 1.0.0
 * Description: Captures a snapshot baseline of reranked results
 * Author: @devilsdev
 */
const { LLMReranker } = require("../../../src/reranker/llm-reranker.js");

test("LLMReranker output snapshot", async () => {
  const mockLLM = {
    async generate() {
      return "[1, 0, 2]";
    },
  };
  const mockDocs = [{ text: "A" }, { text: "B" }, { text: "C" }];
  const reranker = new LLMReranker({ llm: mockLLM });
  const result = await reranker.rerank("What is A?", mockDocs);
  expect(result).toMatchSnapshot();
});
