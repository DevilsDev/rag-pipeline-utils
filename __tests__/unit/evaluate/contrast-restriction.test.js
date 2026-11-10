/**
 * A contrast clause that narrows what came before ("..., but not for
 * guests", "..., but only on Fridays", "..., except for sale items") is a
 * restriction: an answer that leaves it out grants more than its source.
 * A contrast clause that only adds something ("..., but it may take a few
 * minutes") may still be left out.
 */

const { checkAnswer } = require("../../../src/grounding/check-answer");

// The judge is never called: these are decided by the lexical checks
const judge = {
  generate: async () => {
    throw new Error("the judge should not be called");
  },
};

async function check(answer, source) {
  const result = await checkAnswer({
    answer,
    sources: [source],
    evaluate: false,
    judge,
  });
  return {
    grounded: result.grounded,
    reason: result.judge.verdicts[0].lexicalReason,
  };
}

describe("a contrast clause carrying a restriction", () => {
  test.each([
    ["Access is allowed, but not for guests.", "Access is allowed."],
    ["Refunds are available, except for sale items.", "Refunds are available."],
    ["Remote work is allowed, but only on Fridays.", "Remote work is allowed."],
  ])("leaving out the restriction of %j is flagged", async (source, answer) => {
    expect(await check(answer, source)).toEqual({
      grounded: false,
      reason: "condition_mismatch",
    });
  });

  test.each([
    [
      "Access is allowed, but not for guests.",
      "Access is allowed, but not for guests.",
    ],
    [
      "Remote work is allowed, but only on Fridays.",
      "Remote work is allowed only on Fridays.",
    ],
  ])("keeping the restriction of %j is grounded", async (source, answer) => {
    expect(await check(answer, source)).toEqual({
      grounded: true,
      reason: "supported",
    });
  });
});

describe("a contrast clause that adds something else", () => {
  test.each([
    [
      "The upgrade is free, but it may take a few minutes.",
      "The upgrade is free.",
    ],
    [
      "The office opens at 9, but most people arrive later.",
      "The office opens at 9.",
    ],
    [
      "The drug reduced blood pressure in adults, but not in children under twelve.",
      "The drug reduced blood pressure in adults.",
    ],
    [
      "Full-time staff receive dental coverage from their first day of employment, but not part-time staff.",
      "Full-time staff receive dental coverage from their first day of employment.",
    ],
    [
      "Employees must complete safety training before operating forklifts, but not before using hand trucks.",
      "Employees must complete safety training before operating forklifts.",
    ],
  ])("leaving out the contrast of %j is grounded", async (source, answer) => {
    expect(await check(answer, source)).toEqual({
      grounded: true,
      reason: "supported",
    });
  });
});
