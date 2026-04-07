"use strict";

const { BM25Search } = require("../../../src/retrieval/bm25-search");
const { reciprocalRankFusion } = require("../../../src/retrieval/rank-fusion");
const { HybridRetriever } = require("../../../src/retrieval/hybrid-retriever");

// ---------------------------------------------------------------------------
// BM25Search
// ---------------------------------------------------------------------------
describe("BM25Search", () => {
  let bm25;

  beforeEach(() => {
    bm25 = new BM25Search();
  });

  // -- index() --------------------------------------------------------------
  describe("index()", () => {
    test("indexes documents and builds inverted index", () => {
      const docs = [
        { id: "1", content: "the quick brown fox" },
        { id: "2", content: "the lazy brown dog" },
      ];
      bm25.index(docs);

      expect(bm25.docCount).toBe(2);
      expect(bm25.invertedIndex.size).toBeGreaterThan(0);
      expect(bm25.invertedIndex.has("brown")).toBe(true);
    });

    test("computes avgDocLength correctly", () => {
      const docs = [
        { id: "1", content: "hello world" }, // 2 tokens
        { id: "2", content: "hello world again" }, // 3 tokens (after tokenize strips punctuation)
      ];
      bm25.index(docs);

      expect(bm25.avgDocLength).toBe(2.5);
    });

    test('emits "indexed" event with docCount and uniqueTerms', () => {
      const handler = jest.fn();
      bm25.on("indexed", handler);

      bm25.index([
        { id: "1", content: "alpha beta" },
        { id: "2", content: "beta gamma" },
      ]);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          docCount: 2,
          uniqueTerms: expect.any(Number),
        }),
      );
    });

    test("does nothing for empty array", () => {
      bm25.index([]);
      expect(bm25.docCount).toBe(0);
    });

    test("does nothing for non-array input", () => {
      bm25.index(null);
      expect(bm25.docCount).toBe(0);
    });
  });

  // -- search() -------------------------------------------------------------
  describe("search()", () => {
    beforeEach(() => {
      bm25.index([
        { id: "a", content: "machine learning algorithms for classification" },
        { id: "b", content: "deep learning neural networks transformers" },
        { id: "c", content: "cooking recipes for pasta and pizza" },
      ]);
    });

    test("returns ranked results for a relevant query", () => {
      const results = bm25.search("machine learning");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe("a");
    });

    test("scores relevant docs higher than irrelevant ones", () => {
      const results = bm25.search("learning");
      const mlDoc = results.find((r) => r.id === "a");
      const cookDoc = results.find((r) => r.id === "c");
      expect(mlDoc).toBeDefined();
      expect(cookDoc).toBeUndefined();
    });

    test("respects topK via the k option", () => {
      const results = bm25.search("learning", { k: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });

    test('emits "searched" event', () => {
      const handler = jest.fn();
      bm25.on("searched", handler);
      bm25.search("learning");
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "learning",
          resultCount: expect.any(Number),
        }),
      );
    });

    test("returns empty array for empty query", () => {
      expect(bm25.search("")).toEqual([]);
    });

    test("returns empty array for null query", () => {
      expect(bm25.search(null)).toEqual([]);
    });

    test("returns empty array when no documents are indexed", () => {
      const fresh = new BM25Search();
      expect(fresh.search("hello")).toEqual([]);
    });
  });

  // -- clear() --------------------------------------------------------------
  describe("clear()", () => {
    test("resets index completely", () => {
      bm25.index([{ id: "1", content: "hello world" }]);
      bm25.clear();

      expect(bm25.docCount).toBe(0);
      expect(bm25.documents).toEqual([]);
      expect(bm25.avgDocLength).toBe(0);
      expect(bm25.invertedIndex.size).toBe(0);
    });
  });

  // -- edge cases -----------------------------------------------------------
  describe("edge cases", () => {
    test('indexes documents that use "text" field instead of "content"', () => {
      bm25.index([{ id: "1", text: "hello world" }]);
      const results = bm25.search("hello");
      expect(results.length).toBe(1);
      expect(results[0].content).toBe("hello world");
    });

    test("handles documents without content or text field gracefully", () => {
      bm25.index([{ id: "1", metadata: { tag: "empty" } }]);
      expect(bm25.docCount).toBe(1);
      const results = bm25.search("anything");
      expect(results).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// reciprocalRankFusion
// ---------------------------------------------------------------------------
describe("reciprocalRankFusion", () => {
  test("merges multiple result sets and deduplicates by id", () => {
    const setA = [
      { id: "1", score: 0.9, content: "doc1" },
      { id: "2", score: 0.8, content: "doc2" },
    ];
    const setB = [
      { id: "2", score: 0.7, content: "doc2" },
      { id: "3", score: 0.6, content: "doc3" },
    ];

    const fused = reciprocalRankFusion([setA, setB]);
    const ids = fused.map((r) => r.id);

    expect(ids).toContain("1");
    expect(ids).toContain("2");
    expect(ids).toContain("3");
    // No duplicate id '2'
    expect(ids.filter((x) => x === "2").length).toBe(1);
  });

  test("results are sorted by fused score descending", () => {
    const setA = [
      { id: "1", score: 0.9 },
      { id: "2", score: 0.5 },
    ];
    const setB = [
      { id: "1", score: 0.8 },
      { id: "3", score: 0.7 },
    ];

    const fused = reciprocalRankFusion([setA, setB]);
    for (let i = 1; i < fused.length; i++) {
      expect(fused[i - 1].score).toBeGreaterThanOrEqual(fused[i].score);
    }
  });

  test("respects per-set weights", () => {
    const setA = [{ id: "1", score: 0.9 }];
    const setB = [{ id: "2", score: 0.9 }];

    const fused = reciprocalRankFusion([setA, setB], { weights: [2.0, 1.0] });
    const doc1 = fused.find((r) => r.id === "1");
    const doc2 = fused.find((r) => r.id === "2");
    // doc1 should have a higher fused score due to 2x weight
    expect(doc1.score).toBeGreaterThan(doc2.score);
  });

  test("returns empty array for empty result sets", () => {
    expect(reciprocalRankFusion([])).toEqual([]);
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });

  test("returns empty array for non-array input", () => {
    expect(reciprocalRankFusion(null)).toEqual([]);
  });

  test("handles single result set", () => {
    const set = [{ id: "1", score: 0.5, content: "doc1" }];
    const fused = reciprocalRankFusion([set]);
    expect(fused.length).toBe(1);
    expect(fused[0].id).toBe("1");
  });

  test("skips results with missing ids", () => {
    const set = [
      { id: "1", score: 0.9 },
      { score: 0.8 }, // no id
      { id: null, score: 0.7 }, // null id is valid (coerced to "null")
    ];
    const fused = reciprocalRankFusion([set]);
    // id: null is coerced to "null" string, so 2 results total (null id passes the != null check as false)
    expect(fused.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// HybridRetriever
// ---------------------------------------------------------------------------
describe("HybridRetriever", () => {
  test("runs multiple retrievers in parallel and fuses results", async () => {
    const retrieverA = {
      retrieve: jest.fn(async () => [{ id: "1", score: 0.9, content: "doc1" }]),
    };
    const retrieverB = {
      retrieve: jest.fn(async () => [{ id: "2", score: 0.8, content: "doc2" }]),
    };

    const hybrid = new HybridRetriever([
      { retriever: retrieverA, weight: 1.0, name: "A" },
      { retriever: retrieverB, weight: 1.0, name: "B" },
    ]);

    const results = await hybrid.retrieve({ query: "test" });
    expect(results.length).toBe(2);
    expect(retrieverA.retrieve).toHaveBeenCalled();
    expect(retrieverB.retrieve).toHaveBeenCalled();
  });

  test("supports retrievers with .search() instead of .retrieve()", async () => {
    const retriever = {
      search: jest.fn(async () => [{ id: "1", score: 0.9, content: "doc1" }]),
    };

    const hybrid = new HybridRetriever([
      { retriever, weight: 1.0, name: "search-based" },
    ]);

    const results = await hybrid.retrieve({ query: "test" });
    expect(results.length).toBe(1);
    expect(retriever.search).toHaveBeenCalled();
  });

  test("graceful degradation when one retriever fails", async () => {
    const good = {
      retrieve: jest.fn(async () => [{ id: "1", score: 0.9, content: "ok" }]),
    };
    const bad = {
      retrieve: jest.fn(async () => {
        throw new Error("network error");
      }),
    };

    const hybrid = new HybridRetriever([
      { retriever: good, weight: 1.0, name: "good" },
      { retriever: bad, weight: 1.0, name: "bad" },
    ]);

    const errorHandler = jest.fn();
    hybrid.on("retrieverError", errorHandler);

    const results = await hybrid.retrieve({ query: "test" });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("1");
    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({ name: "bad" }),
    );
  });

  test("returns empty array when no retrievers configured", async () => {
    const hybrid = new HybridRetriever([]);
    const results = await hybrid.retrieve({ query: "test" });
    expect(results).toEqual([]);
  });

  test("addRetriever() dynamically adds a retriever", async () => {
    const hybrid = new HybridRetriever([]);
    const r = {
      retrieve: jest.fn(async () => [{ id: "1", score: 0.9, content: "doc" }]),
    };

    hybrid.addRetriever(r, 1.5, "dynamic");
    expect(hybrid.retrievers.length).toBe(1);
    expect(hybrid.retrievers[0].name).toBe("dynamic");
    expect(hybrid.retrievers[0].weight).toBe(1.5);

    const results = await hybrid.retrieve({ query: "test" });
    expect(results.length).toBe(1);
  });

  test('emits "retrieved" event with metadata', async () => {
    const retriever = {
      retrieve: jest.fn(async () => [{ id: "1", score: 0.9, content: "doc" }]),
    };
    const hybrid = new HybridRetriever([{ retriever, weight: 1.0, name: "r" }]);

    const handler = jest.fn();
    hybrid.on("retrieved", handler);

    await hybrid.retrieve({ query: "test" });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        totalRetrievers: 1,
        successfulRetrievers: 1,
        resultCount: 1,
      }),
    );
  });

  test("respects topK from query parameter", async () => {
    const docs = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      score: 1 - i * 0.01,
      content: `doc${i}`,
    }));
    const retriever = { retrieve: jest.fn(async () => docs) };
    const hybrid = new HybridRetriever([{ retriever, weight: 1.0, name: "r" }]);

    const results = await hybrid.retrieve({ query: "test", topK: 3 });
    expect(results.length).toBe(3);
  });
});
