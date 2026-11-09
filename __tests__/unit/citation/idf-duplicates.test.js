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

describe("sources a sentence shares no word with", () => {
  test("don't count in that sentence's word weights", () => {
    const unrelated = {
      content: "The lighthouse on the northern headland was painted white.",
    };
    const sentence = "Remote work is allowed two days per week.";
    expect([...buildIDFWeights([a, b, unrelated], { sentence })]).toEqual([
      ...buildIDFWeights([a, b], { sentence }),
    ]);
    // without a sentence every source counts, as before
    expect(buildIDFWeights([a, b, unrelated]).get("remote")).not.toBe(
      buildIDFWeights([a, b]).get("remote"),
    );
  });

  test("don't change a sentence's score", () => {
    const answer = "Remote work is allowed two days per week for new hires.";
    const unrelated = {
      content: "The lighthouse on the northern headland was painted white.",
    };
    const before = new CitationTracker().track(answer, [a, b]);
    const after = new CitationTracker().track(answer, [a, b, unrelated]);
    expect(after.citations[0].sources[0].score).toBe(
      before.citations[0].sources[0].score,
    );
  });
});
