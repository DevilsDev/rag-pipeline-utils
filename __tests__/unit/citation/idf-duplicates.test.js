/**
 * Word weights count identical sources once, so a duplicated source doesn't
 * move any score.
 */

const { buildIDFWeights } = require("../../../src/citation/source-mapper");
const { CitationTracker } = require("../../../src/citation/citation-tracker");

const a = { content: "Remote work is allowed two days per week." };
const b = { content: "New hires may not work remotely in their first month." };

describe("identical sources", () => {
  test("are counted once in the word weights", () => {
    expect([...buildIDFWeights([a, b, { ...a }])]).toEqual([
      ...buildIDFWeights([a, b]),
    ]);
    // the same text after normalisation (a no-break space)
    expect([
      ...buildIDFWeights([a, b, { text: a.content.replace(" ", " ") }]),
    ]).toEqual([...buildIDFWeights([a, b])]);
  });

  test("don't change a sentence's score", () => {
    const answer = "Remote work is allowed two days per week for new hires.";
    const once = new CitationTracker().track(answer, [a, b]);
    const twice = new CitationTracker().track(answer, [a, b, { ...a }]);
    expect(twice.citations[0].sources[0].score).toBe(
      once.citations[0].sources[0].score,
    );
  });
});
