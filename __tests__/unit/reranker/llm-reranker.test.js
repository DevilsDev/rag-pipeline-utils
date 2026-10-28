/**
 * File: __tests__/unit/reranker/llm-reranker.test.js
 * Version: 1.0.0
 * Description: Validates core behavior of the LLMReranker module
 * Author: @devilsdev
 */

const { LLMReranker } = require("../../../src/reranker/llm-reranker.js");

describe("LLMReranker", () => {
  test("returns reranked documents based on mock LLM JSON output", async () => {
    const mockLLM = {
      async generate() {
        return "[1, 0, 2]";
      },
    };
    const docs = [{ text: "A" }, { text: "B" }, { text: "C" }];
    const reranker = new LLMReranker({ llm: mockLLM });
    const result = await reranker.rerank("What is A?", docs);
    expect(result.map((d) => d.text)).toEqual(["B", "A", "C"]);
  });

  test("sends a ranking instruction containing the query and numbered docs", async () => {
    const llm = { generate: jest.fn(async () => "[0]") };
    const docs = [{ content: "Alpha text" }, { content: "Beta text" }];

    await new LLMReranker({ llm }).rerank("Which is beta?", docs);

    const [prompt, context] = llm.generate.mock.calls[0];
    expect(prompt).toContain("Which is beta?");
    expect(prompt).toContain("[0] Alpha text");
    expect(prompt).toContain("[1] Beta text");
    expect(prompt).toMatch(/JSON array/);
    expect(context).toEqual([]);
  });

  test("extracts the ranking from prose or a code fence", async () => {
    const llm = {
      generate: async () =>
        "Sure! Here is the ranking:\n```json\n[2, 1, 0]\n```",
    };
    const docs = [{ text: "A" }, { text: "B" }, { text: "C" }];

    const result = await new LLMReranker({ llm }).rerank("q", docs);

    expect(result.map((d) => d.text)).toEqual(["C", "B", "A"]);
  });

  test("keeps documents the LLM left out, after the ranked ones", async () => {
    const llm = { generate: async () => "[2]" };
    const docs = [{ text: "A" }, { text: "B" }, { text: "C" }];

    const result = await new LLMReranker({ llm }).rerank("q", docs);

    expect(result.map((d) => d.text)).toEqual(["C", "A", "B"]);
  });

  test("honours topK", async () => {
    const llm = { generate: async () => "[1, 0, 2]" };
    const docs = [{ text: "A" }, { text: "B" }, { text: "C" }];

    const result = await new LLMReranker({ llm }).rerank("q", docs, {
      topK: 2,
    });

    expect(result.map((d) => d.text)).toEqual(["B", "A"]);
  });
});
