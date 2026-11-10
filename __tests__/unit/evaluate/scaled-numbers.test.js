/**
 * A number followed by thousand, million, billion or trillion is one value:
 * "5 million" is 5,000,000.
 */

const {
  checkNumericConsistency,
  extractNumbers,
} = require("../../../src/evaluate/scoring");

describe("digits with a scale word", () => {
  test.each([
    ["The company earned 5 million dollars.", "The company earned $5,000,000."],
    [
      "The project costs 2.5 million euros.",
      "The project costs 2,500,000 euros.",
    ],
    ["About 1.1 billion people use it.", "About 1,100,000,000 people use it."],
    ["The town has 12 thousand residents.", "The town has 12,000 residents."],
    [
      "The company earned 5 million dollars.",
      "The company earned five million dollars.",
    ],
  ])("%j matches %j", (claim, source) => {
    expect(checkNumericConsistency(claim, source).consistent).toBe(true);
    expect(checkNumericConsistency(source, claim).consistent).toBe(true);
  });

  test.each([
    [
      "The company earned 5 million dollars.",
      "The company earned 5 billion dollars.",
    ],
    ["The company earned 5 million dollars.", "The company earned $5,000."],
  ])("%j doesn't match %j", (claim, source) => {
    expect(checkNumericConsistency(claim, source).consistent).toBe(false);
  });

  test("the value is one number", () => {
    expect(extractNumbers("It cost 2.5 million.").values).toEqual(["2500000"]);
  });
});
