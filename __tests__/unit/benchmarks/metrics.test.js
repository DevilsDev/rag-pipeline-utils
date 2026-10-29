"use strict";

const {
  ndcgAtK,
  recallAtK,
  mrrAtK,
  evaluateRuns,
} = require("../../../benchmarks/metrics");

// Expected values worked out by hand: DCG = sum of gain / log2(rank + 1)
describe("benchmark ranking metrics", () => {
  const binary = new Map([
    ["b", 1],
    ["d", 1],
  ]);

  it("nDCG@k for binary judgements", () => {
    // DCG = 1/log2(3) + 1/log2(5) = 1.06161; ideal = 1 + 1/log2(3) = 1.63093
    expect(ndcgAtK(["a", "b", "c", "d"], binary, 10)).toBeCloseTo(0.65092, 5);
    expect(ndcgAtK(["b", "d"], binary, 10)).toBeCloseTo(1, 10);
    expect(ndcgAtK(["a", "c"], binary, 10)).toBe(0);
  });

  it("nDCG@k uses graded gains and only the top k", () => {
    const graded = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    // DCG = 1 + 2/log2(3) = 2.26186; ideal = 2 + 1/log2(3) = 2.63093
    expect(ndcgAtK(["a", "b"], graded, 10)).toBeCloseTo(0.85972, 5);
    // d is at rank 4, outside k = 3; ideal@3 still counts both relevant
    expect(ndcgAtK(["a", "b", "c", "d"], binary, 3)).toBeCloseTo(
      1 / Math.log2(3) / (1 + 1 / Math.log2(3)),
      10,
    );
  });

  it("recall@k and MRR@k", () => {
    expect(recallAtK(["a", "b", "c", "d"], binary, 2)).toBe(0.5);
    expect(recallAtK(["a", "b", "c", "d"], binary, 10)).toBe(1);
    expect(mrrAtK(["a", "b", "c", "d"], binary, 10)).toBe(0.5);
    expect(mrrAtK(["x", "y", "b"], binary, 2)).toBe(0);
    expect(recallAtK(["a"], new Map(), 10)).toBe(0);
  });

  it("averages over every judged query, scoring a missing run as 0", () => {
    const qrels = new Map([
      ["q1", new Map([["a", 1]])],
      ["q2", new Map([["z", 1]])],
    ]);
    const runs = new Map([["q1", ["a", "b"]]]);
    expect(evaluateRuns(runs, qrels)).toEqual({
      ndcg10: 0.5,
      recall10: 0.5,
      recall100: 0.5,
      mrr10: 0.5,
    });
  });
});
