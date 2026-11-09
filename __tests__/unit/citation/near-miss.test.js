/**
 * A sentence some source supports, but below the threshold, is a likely
 * hallucination with its best score; one no source supports at all is a
 * definite one.
 */

const { CitationTracker } = require("../../../src/citation/citation-tracker");

describe("near misses", () => {
  test("a sentence below the threshold is a likely hallucination, with its best score", () => {
    const docs = [
      {
        id: "a",
        content: "The cafeteria serves lunch to employees on weekdays.",
      },
    ];
    const result = new CitationTracker().track(
      "Lunch is served on Saturdays. Quantum gravity remains unsolved.",
      docs,
    );
    const [near, none] = result.hallucinationReport.sentences;
    expect(near.classification).toBe("likely_hallucination");
    expect(near.bestScore).toBeGreaterThan(0);
    expect(near.bestScore).toBeLessThan(0.5);
    expect(near.bestSource).toBeNull();
    expect(none.classification).toBe("definite_hallucination");
    expect(none.bestScore).toBe(0);
    expect(result.hallucinationReport.summary).toEqual({
      grounded: 0,
      likely_hallucination: 1,
      definite_hallucination: 1,
    });
    // Citations still list only sources at or above the threshold
    expect(result.citations.map((c) => c.sources)).toEqual([[], []]);
    expect(result.groundednessScore).toBe(0);
  });
});
