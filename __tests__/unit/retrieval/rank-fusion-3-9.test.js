"use strict";

const { reciprocalRankFusion } = require("../../../src/retrieval/rank-fusion");

describe("reciprocalRankFusion scoring", () => {
  test("rank 1 scores 1/(k+1)", () => {
    const [top] = reciprocalRankFusion([[{ id: "a" }]], { k: 60 });
    expect(top.score).toBeCloseTo(1 / 61, 10);
  });

  test("an id repeated within one list is counted once, at its first rank", () => {
    const fused = reciprocalRankFusion(
      [[{ id: "a" }, { id: "b" }, { id: "a" }]],
      { k: 60 },
    );
    const a = fused.find((r) => r.id === "a");
    expect(a.score).toBeCloseTo(1 / 61, 10);
  });

  test("an id in two lists still adds up across the lists", () => {
    const fused = reciprocalRankFusion(
      [[{ id: "a" }], [{ id: "x" }, { id: "a" }]],
      {
        k: 60,
      },
    );
    expect(fused.find((r) => r.id === "a").score).toBeCloseTo(
      1 / 61 + 1 / 62,
      10,
    );
  });

  test("a repeated copy in one list still contributes its access restriction", () => {
    const fused = reciprocalRankFusion([
      [
        { id: "a", content: "x" },
        { id: "a", content: "x", acl: ["hr"] },
      ],
    ]);
    expect(fused[0].requiredRole || fused[0].acl).toEqual(["hr"]);
  });
});
