"use strict";

const {
  EmbeddingReranker,
} = require("../../../src/reranker/embedding-reranker");

/** Deterministic 3-d embedding from text so results are comparable. */
function vectorFor(text) {
  const s = String(text);
  return [s.length, (s.charCodeAt(0) || 0) % 7, s.includes("cat") ? 5 : 1];
}

describe("EmbeddingReranker document embedding cache", () => {
  let embedder;
  beforeEach(() => {
    embedder = { embedQuery: jest.fn(async (text) => vectorFor(text)) };
  });

  const docs = [
    { id: "a", content: "the cat sat" },
    { id: "b", content: "dogs bark" },
    { id: "c", content: "a cat nap" },
  ];

  test("second query reuses cached document embeddings", async () => {
    const reranker = new EmbeddingReranker(embedder);
    const first = await reranker.rerank("cat", docs);
    expect(embedder.embedQuery).toHaveBeenCalledTimes(4); // query + 3 docs

    const second = await reranker.rerank("cat", docs);
    // Only the query is embedded again.
    expect(embedder.embedQuery).toHaveBeenCalledTimes(5);
    expect(second).toEqual(first);
    expect(reranker.cacheStats).toEqual({ hits: 3, misses: 3 });
  });

  test("cache is keyed by content, not object identity", async () => {
    const reranker = new EmbeddingReranker(embedder);
    await reranker.rerank("q", [{ id: 1, content: "same text" }]);
    await reranker.rerank("q", [{ id: 2, text: "same text" }]);
    const docCalls = embedder.embedQuery.mock.calls.filter(
      ([t]) => t === "same text",
    );
    expect(docCalls).toHaveLength(1);
  });

  test("duplicate documents within one call are embedded once", async () => {
    const reranker = new EmbeddingReranker(embedder);
    const out = await reranker.rerank("q", ["dup", "dup", "other"]);
    expect(out).toHaveLength(3);
    expect(
      embedder.embedQuery.mock.calls.filter(([t]) => t === "dup"),
    ).toHaveLength(1);
  });

  test("cache is bounded (LRU eviction)", async () => {
    const reranker = new EmbeddingReranker(embedder, { cacheSize: 2 });
    await reranker.rerank("q", ["d1", "d2", "d3"]);
    expect(reranker._cache.size).toBe(2);
    embedder.embedQuery.mockClear();
    // d1 was evicted (least recently used); d3 is still cached.
    await reranker.rerank("q", ["d3"]);
    await reranker.rerank("q", ["d1"]);
    const texts = embedder.embedQuery.mock.calls.map(([t]) => t);
    expect(texts).toEqual(["q", "q", "d1"]);
  });

  test("cacheSize 0 disables caching", async () => {
    const reranker = new EmbeddingReranker(embedder, { cacheSize: 0 });
    await reranker.rerank("q", ["d1"]);
    await reranker.rerank("q", ["d1"]);
    expect(embedder.embedQuery).toHaveBeenCalledTimes(4);
  });

  test("failed embeddings are not cached", async () => {
    const reranker = new EmbeddingReranker(embedder);
    embedder.embedQuery.mockImplementation(async (text) => {
      if (text === "bad") throw new Error("embed failed");
      return vectorFor(text);
    });
    await expect(reranker.rerank("q", ["bad"])).rejects.toThrow("embed failed");
    embedder.embedQuery.mockImplementation(async (text) => vectorFor(text));
    await expect(reranker.rerank("q", ["bad"])).resolves.toHaveLength(1);
  });

  test("clearCache empties the cache", async () => {
    const reranker = new EmbeddingReranker(embedder);
    await reranker.rerank("q", ["d1"]);
    reranker.clearCache();
    expect(reranker._cache.size).toBe(0);
  });
});

describe("EmbeddingReranker concurrency limit", () => {
  test("one request's abort does not fail another sharing the cache", async () => {
    const pending = new Map();
    const embedder = {
      embedQuery: jest.fn((text, opts = {}) => {
        if (text === "q") return Promise.resolve([1, 0]);
        return new Promise((resolve, reject) => {
          const list = pending.get(text) || [];
          list.push(resolve);
          pending.set(text, list);
          if (opts.signal) {
            opts.signal.addEventListener("abort", () =>
              reject(
                Object.assign(new Error("aborted"), { name: "AbortError" }),
              ),
            );
          }
        });
      }),
    };
    const reranker = new EmbeddingReranker(embedder);
    const a = new AbortController();
    const b = new AbortController();
    const pA = reranker.rerank("q", ["shared"], { signal: a.signal });
    const pB = reranker.rerank("q", ["shared"], { signal: b.signal });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    a.abort();
    await expect(pA).rejects.toMatchObject({ name: "AbortError" });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    // B re-embedded with its own signal; resolve every pending embedding.
    for (const resolve of pending.get("shared")) resolve([1, 0]);
    await expect(pB).resolves.toEqual([{ text: "shared", relevanceScore: 1 }]);
  });

  test("never has more than `concurrency` document embeddings in flight", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const embedder = {
      embedQuery: jest.fn(async (text) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        // Yield a few microtask turns so concurrent calls overlap.
        for (let i = 0; i < 5; i++) await Promise.resolve();
        inFlight--;
        return vectorFor(text);
      }),
    };
    const reranker = new EmbeddingReranker(embedder, { concurrency: 3 });
    const docs = Array.from({ length: 20 }, (_, i) => `doc ${i}`);
    const out = await reranker.rerank("doc", docs);
    expect(out).toHaveLength(20);
    expect(maxInFlight).toBe(3);
  });

  test("results keep scores aligned with their documents", async () => {
    const embedder = {
      embed: jest.fn(async (text) => (text === "match" ? [1, 0] : [0, 1])),
    };
    const reranker = new EmbeddingReranker(embedder, { concurrency: 2 });
    const out = await reranker.rerank("match", ["x", "y", "match", "z"]);
    expect(out[0]).toEqual({ text: "match", relevanceScore: 1 });
  });

  test("rejects an invalid concurrency", () => {
    expect(
      () => new EmbeddingReranker({ embed() {} }, { concurrency: 0 }),
    ).toThrow(/concurrency/);
  });
});
