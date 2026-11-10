/**
 * A minus sign is part of a number: "-3%" is not "3%".
 */

const {
  checkNumericConsistency,
  extractNumbers,
} = require("../../../src/evaluate/scoring");

describe("negative numbers", () => {
  test.each([
    [
      "The freezer is kept at -18 degrees.",
      "The freezer is kept at 18 degrees.",
    ],
    ["Sales changed by -3% last year.", "Sales changed by 3% last year."],
    ["The low was −8 degrees.", "The low was 8 degrees."],
    ["The account is at -1,000 dollars.", "The account is at 1,000 dollars."],
  ])("%j doesn't match %j", (claim, source) => {
    expect(checkNumericConsistency(claim, source).consistent).toBe(false);
    expect(checkNumericConsistency(source, claim).consistent).toBe(false);
  });

  test.each([
    [
      "The freezer is kept at -18 degrees.",
      "The freezer is kept at −18 degrees.",
    ],
    [
      "Sales changed by -3% last year.",
      "Sales changed by -3 percent last year.",
    ],
  ])("%j matches %j", (claim, source) => {
    expect(checkNumericConsistency(claim, source).consistent).toBe(true);
  });

  test("a hyphen between numbers or after a word is not a minus", () => {
    expect(extractNumbers("Allow 5-10 days.").values).toEqual(["5", "10"]);
    expect(extractNumbers("Born 2019-05-12.").values).toEqual([
      "2019",
      "5",
      "12",
    ]);
    expect(
      checkNumericConsistency("COVID-19 cases rose.", "COVID-19 cases rose.")
        .consistent,
    ).toBe(true);
    expect(extractNumbers("It is -4 outside.").values).toEqual(["-4"]);
  });
});
