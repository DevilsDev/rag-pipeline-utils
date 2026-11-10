/**
 * "no more than", "no later than", "at no cost" and "No. 7" don't negate a
 * sentence; "no" elsewhere still does.
 */

const {
  checkPolarityConsistency,
  isNegated,
  tokenize,
} = require("../../../src/evaluate/scoring");

describe("no that doesn't negate", () => {
  test.each([
    [
      "Requests must be submitted no later than Friday.",
      "Requests must be submitted by Friday.",
    ],
    [
      "Groups of no more than 8 people may book.",
      "Groups of up to 8 people may book.",
    ],
    [
      "Visitors may bring no fewer than two guests.",
      "Visitors may bring at least two guests.",
    ],
    ["Delivery is provided at no cost.", "Delivery is provided free."],
    ["Repairs are done at no extra charge.", "Repairs are done free."],
    ["Use form No. 7 to apply.", "Use form 7 to apply."],
  ])("%j agrees with %j", (claim, source) => {
    expect(checkPolarityConsistency(claim, source).consistent).toBe(true);
  });

  test.each([
    "There will be no more meetings.",
    "No refunds are given.",
    "There is no cost estimate yet.",
  ])("%j is still negated", (text) => {
    expect(isNegated(tokenize(text))).toBe(true);
  });
});
