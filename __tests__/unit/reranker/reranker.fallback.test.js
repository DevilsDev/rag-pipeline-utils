/**
 * File: __tests__/unit/reranker/reranker.fallback.test.js
 * Version: 1.0.0
 * Description: Validates fallback handling for invalid LLM output
 * Author: @devilsdev
 */
const { LLMReranker } = require("../../../src/reranker/llm-reranker.js");

test("gracefully handles invalid LLM output", async () => {
  const mockLLM = {
    async generate() {
      return "INVALID_JSON";
    },
  };
  const docs = [{ text: "X" }, { text: "Y" }, { text: "Z" }];
  const reranker = new LLMReranker({ llm: mockLLM });
  const result = await reranker.rerank("Prompt?", docs);
  expect(result.map((d) => d.text)).toEqual(["X", "Y", "Z"]);
});
