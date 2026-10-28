"use strict";

const scoring = require("../../../src/evaluate/scoring");
const { BM25Search } = require("../../../src/retrieval/bm25-search");

const { tokenize } = scoring;

/**
 * The scoring loop as it was before document lengths were precomputed
 * (re-tokenizing each posting's document). Used as the reference.
 */
function referenceSearch(
  documents,
  query,
  { k = 10, k1 = 1.2, b = 0.75 } = {},
) {
  const inverted = new Map();
  let total = 0;
  documents.forEach((doc, docIndex) => {
    const tokens = tokenize(doc.content || doc.text || "");
    total += tokens.length;
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    for (const [t, f] of tf) {
      if (!inverted.has(t)) inverted.set(t, []);
      inverted.get(t).push({ docIndex, tf: f });
    }
  });
  const N = documents.length;
  const avg = total / N;
  const scores = new Map();
  for (const token of tokenize(query)) {
    const postings = inverted.get(token);
    if (!postings) continue;
    const df = postings.length;
    const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
    for (const { docIndex, tf } of postings) {
      const d = documents[docIndex];
      const len = tokenize(d.content || d.text || "").length;
      const s = idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (len / avg))));
      scores.set(docIndex, (scores.get(docIndex) || 0) + s);
    }
  }
  return [...scores]
    .map(([i, score]) => ({
      id: documents[i].id,
      score,
      content: documents[i].content || documents[i].text || "",
      metadata: documents[i].metadata || {},
    }))
    .sort((a, c) => c.score - a.score)
    .slice(0, k);
}

const corpus = [
  { id: "1", content: "Redis is an in-memory data store used as a cache" },
  {
    id: "2",
    content: "PostgreSQL is a relational database with strong SQL support",
  },
  {
    id: "3",
    text: "Caching with Redis reduces database load; Redis cache eviction uses LRU",
  },
  {
    id: "4",
    content: "Vector databases store embeddings for semantic search",
    metadata: { tag: "v" },
  },
  {
    id: "5",
    content:
      "BM25 is a ranking function used by search engines like Elasticsearch",
  },
  { id: "6", content: "" },
  { id: "7", content: "search search search ranking database cache redis" },
];

const queries = [
  "redis cache",
  "database search",
  "semantic vector embeddings",
  "ranking function bm25",
  "nothing matches here zzz",
  "redis",
];

describe("BM25Search", () => {
  test.each(queries)("results for %j are unchanged vs the reference", (q) => {
    const bm25 = new BM25Search();
    bm25.index(corpus);
    const actual = bm25.search(q, { k: 5 });
    const expected = referenceSearch(corpus, q, { k: 5 });
    expect(actual.map((r) => r.id)).toEqual(expected.map((r) => r.id));
    actual.forEach((r, i) => {
      expect(r.score).toBeCloseTo(expected[i].score, 12);
      expect(r.content).toBe(expected[i].content);
      expect(r.metadata).toEqual(expected[i].metadata);
    });
  });

  test("custom k1/b match the reference too", () => {
    const bm25 = new BM25Search({ k1: 2, b: 0.3 });
    bm25.index(corpus);
    const actual = bm25.search("redis database cache", { k: 10 });
    const expected = referenceSearch(corpus, "redis database cache", {
      k: 10,
      k1: 2,
      b: 0.3,
    });
    expect(actual.map((r) => [r.id, Number(r.score.toFixed(10))])).toEqual(
      expected.map((r) => [r.id, Number(r.score.toFixed(10))]),
    );
  });

  test("search() tokenizes only the query, never the documents", () => {
    const spy = jest.spyOn(scoring, "tokenize");
    try {
      const bm25 = new BM25Search();
      bm25.index(corpus);
      expect(spy).toHaveBeenCalledTimes(corpus.length);

      spy.mockClear();
      const results = bm25.search("redis cache database search");
      expect(results.length).toBeGreaterThan(0);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith("redis cache database search");
    } finally {
      spy.mockRestore();
    }
  });

  test("document lengths are precomputed at index time", () => {
    const bm25 = new BM25Search();
    bm25.index(corpus);
    expect(bm25.docLengths).toEqual(
      corpus.map((d) => tokenize(d.content || d.text || "").length),
    );
    bm25.clear();
    expect(bm25.docLengths).toEqual([]);
  });
});
