"use strict";

const {
  packContext,
  estimateTokens,
} = require("../../../src/core/context-packing");
const { createRagPipeline } = require("../../../src/core/create-pipeline");

const words = (n, word = "word") => Array(n).fill(word).join(" ");

const DOCS = [
  { id: "a", content: words(100), score: 0.9 }, // 499 chars, 125 tokens
  { id: "b", content: "short text here", score: 0.8 },
  { id: "c", content: words(200, "x"), score: 0.7 },
  { id: "d", content: "tiny", score: 0.6 },
];

describe("packContext", () => {
  test("keeps documents in order while they fit and skips ones that don't", () => {
    const packed = packContext(DOCS, { maxTokens: 180 });
    expect(packed.kept).toEqual(["a", "b", "d"]);
    expect(packed.dropped).toEqual(["c"]);
    expect(packed.truncated).toEqual([]);
    expect(packed.tokens).toBeLessThanOrEqual(180);
    expect(packed.documents.map((d) => d.id)).toEqual(["a", "b", "d"]);
  });

  test("counts the per-document wrapper against the budget", () => {
    const content = "abc ".repeat(10).trim(); // 39 chars, 10 tokens
    const exact = packContext([{ id: "a", content }], { maxTokens: 10 });
    expect(exact.truncated).toEqual(["a"]); // the wrapper doesn't fit too
    const roomy = packContext([{ id: "a", content }], { maxTokens: 30 });
    expect(roomy.truncated).toEqual([]);
    expect(roomy.tokens).toBe(
      10 + estimateTokens('<document index="1">\n\n</document>'),
    );
  });

  test("cuts an oversized top document at a word boundary, on a copy", () => {
    const original = { ...DOCS[0], metadata: { source: "a.md" } };
    const packed = packContext([original, DOCS[1]], { maxTokens: 40 });
    const [top] = packed.documents;
    expect(packed.truncated).toEqual(["a"]);
    expect(top.metadata).toEqual({ source: "a.md", truncated: true });
    expect(top.content).toMatch(/^(word )+word$/); // whole words only
    expect(top.content.length).toBeLessThan(original.content.length);
    // The input is untouched.
    expect(original.content).toBe(DOCS[0].content);
    expect(original.metadata).toEqual({ source: "a.md" });
  });

  test("with truncate: false an oversized top document is dropped", () => {
    const packed = packContext(DOCS, { maxTokens: 40, truncate: false });
    expect(packed.kept).toEqual(["b", "d"]);
    expect(packed.dropped).toEqual(["a", "c"]);
  });

  test("works with a token counter that isn't proportional to length", () => {
    // One token per word, whatever its length.
    const countTokens = (text) => (text.match(/\S+/g) || []).length;
    const doc = {
      id: "long",
      content: "internationalization a b c d e f g h i j k l m n o p",
    };
    const packed = packContext([doc], { maxTokens: 8, countTokens });
    const overhead = countTokens('<document index="1">\n\n</document>');
    expect(countTokens(packed.documents[0].content)).toBe(8 - overhead);
    expect(
      packed.documents[0].content.startsWith("internationalization a"),
    ).toBe(true);
    expect(packed.tokens).toBeLessThanOrEqual(8);
  });

  test("strings and documents without ids", () => {
    const packed = packContext(["first passage", "second"], { maxTokens: 100 });
    expect(packed.kept).toEqual([0, 1]);
    expect(packed.documents).toEqual(["first passage", "second"]);
  });

  test("rejects a missing budget or a bad counter", () => {
    expect(() => packContext(DOCS, {})).toThrow(/maxTokens/);
    expect(() =>
      packContext(DOCS, { maxTokens: 10, countTokens: "tiktoken" }),
    ).toThrow(/countTokens/);
  });
});

describe("createRagPipeline with maxContextTokens", () => {
  function setup(cache) {
    const llm = {
      cacheKey: "test-llm",
      calls: [],
      async generate(query, docs) {
        this.calls.push(docs.map((d) => [d.id, d.content.length]));
        return `answer from ${docs.length} documents`;
      },
    };
    const retriever = {
      cacheKey: "test-retriever",
      async retrieve() {
        return DOCS.map((d) => ({ ...d }));
      },
    };
    const pipeline = createRagPipeline({ retriever, llm, cache });
    return { pipeline, llm };
  }

  test("the LLM sees the packed documents, and the result says what was cut", async () => {
    const { pipeline, llm } = setup();
    const result = await pipeline.run({
      query: "q",
      options: { maxContextTokens: 180 },
    });
    expect(result.success).toBe(true);
    expect(llm.calls[0].map(([id]) => id)).toEqual(["a", "b", "d"]);
    expect(result.results.map((d) => d.id)).toEqual(["a", "b", "d"]);
    expect(result.packing).toEqual({
      tokens: expect.any(Number),
      maxTokens: 180,
      kept: ["a", "b", "d"],
      dropped: ["c"],
      truncated: [],
    });
  });

  test("without the option nothing is packed", async () => {
    const { pipeline, llm } = setup();
    const result = await pipeline.run({ query: "q" });
    expect(result.packing).toBeUndefined();
    expect(llm.calls[0]).toHaveLength(4); // all the stub returned
  });

  test("the last stream chunk carries packing", async () => {
    const { pipeline } = setup();
    const stream = await pipeline.run({
      query: "q",
      options: { stream: true, maxContextTokens: 40 },
    });
    let last;
    for await (const chunk of stream) last = chunk;
    expect(last.done).toBe(true);
    expect(last.packing.truncated).toEqual(["a"]);
  });

  test("with a cache: truncation leaves the cached retrieval whole, and budgets don't share answers", async () => {
    const { pipeline, llm } = setup(true);
    const tight = {
      query: "q",
      options: { maxContextTokens: 40, temperature: 0 },
    };
    const roomy = {
      query: "q",
      options: { maxContextTokens: 180, temperature: 0 },
    };

    await pipeline.run(tight);
    const second = await pipeline.run(tight);
    expect(second.cache.retrieval).toBe("hit");
    expect(second.cache.generation).toBe("hit");
    // The retrieval cache still holds the full document, so the cut is
    // recomputed from it, not cut again.
    expect(second.results[0].content).toBe(
      (await pipeline.run(tight)).results[0].content,
    );

    const other = await pipeline.run(roomy);
    expect(other.cache.generation).toBe("miss");
    expect(other.results[0].content).toBe(DOCS[0].content);
    expect(llm.calls).toHaveLength(2); // one per budget
  });
});
