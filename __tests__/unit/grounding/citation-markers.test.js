/**
 * Citation markers ("[1]", ".[2]", "¹") and the number of a list item
 * ("1. ") name where a sentence comes from or where it sits in a list, not
 * a number the source must state.
 */

const { checkAnswer } = require("../../../src/grounding/check-answer");
const { checkNumericConsistency } = require("../../../src/evaluate/scoring");

const source =
  "Full-time employees receive twenty days of paid vacation per year.";

describe("citation markers and list numbers", () => {
  test.each([
    "Full-time employees receive twenty days of paid vacation per year [1].",
    "Full-time employees receive twenty days of paid vacation per year.[2]",
    "Full-time employees receive twenty days of paid vacation per year [1, 3].",
    "Full-time employees receive twenty days of paid vacation per year.¹",
    "Full-time employees receive twenty days of paid vacation per year.²³",
    "1. Full-time employees receive twenty days of paid vacation per year.",
    "2) Full-time employees receive twenty days of paid vacation per year.",
  ])("%s is grounded", async (answer) => {
    const check = await checkAnswer({
      answer,
      sources: [source],
      evaluate: false,
    });
    expect(check.unsupported).toEqual([]);
    expect(check.grounded).toBe(true);
  });

  test("a marker isn't a number the source must state", () => {
    expect(
      checkNumericConsistency(
        "Full-time employees receive twenty days per year [1].",
        source,
      ),
    ).toMatchObject({ consistent: true, missing: [] });
    expect(
      checkNumericConsistency(
        "The deadline is in May [3].",
        "The deadline is in May.",
      ).consistent,
    ).toBe(true);
  });

  test("a wrong number next to a marker is still found", async () => {
    const check = await checkAnswer({
      answer:
        "Full-time employees receive thirty days of paid vacation per year [1].",
      sources: [source],
      evaluate: false,
    });
    expect(check.grounded).toBe(false);
  });

  test("an exponent after a digit is kept", () => {
    expect(
      checkNumericConsistency(
        "The tank holds 10³ litres.",
        "The tank holds 10 litres.",
      ).consistent,
    ).toBe(false);
  });

  test("the judge sees marked list sentences as supported, without a call", async () => {
    const judge = {
      generate: async () => {
        throw new Error("the judge should not be called");
      },
    };
    const answer =
      "1. Full-time employees receive twenty days of paid vacation per year.\n" +
      "2. Remote work is allowed two days per week with manager approval [2].";
    const check = await checkAnswer({
      answer,
      sources: [
        source,
        "Remote work is allowed two days per week with manager approval.",
      ],
      judge,
    });
    expect(check.judge.verdicts.map((v) => v.lexicalReason)).toEqual([
      "supported",
      "supported",
    ]);
    expect(check.grounded).toBe(true);
    expect(check.evaluation.scores.faithfulness).toBe(1);
  });
});

test("a unit's exponent is kept", async () => {
  const check = await checkAnswer({
    answer: "The surface gravity of Mars is 3.71 m/s².",
    sources: ["Mars has a surface gravity of 3.71 m/s²."],
    evaluate: false,
  });
  expect(check.citations[0].sources[0].score).toBe(1);
});
