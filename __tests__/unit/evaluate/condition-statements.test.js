/**
 * The condition check reads the restrictions of the statement a claim
 * restates, not those of another statement joined to it by "and".
 */

const { checkConditionConsistency } = require("../../../src/evaluate/scoring");

describe("statements joined by and", () => {
  test.each([
    [
      "Employees receive 20 days of leave.",
      "Employees receive 20 days of leave and contractors receive 10 days if they work full time.",
    ],
    [
      "Employees receive 20 days of leave.",
      "Employees receive 20 days of leave, and contractors receive 10 days if they work full time.",
    ],
    [
      "The office opens at 9.",
      "The office opens at 9 and the gym opens at 6 if staff are available.",
    ],
  ])("%j keeps the restrictions of its own statement", (claim, source) => {
    expect(checkConditionConsistency(claim, source)).toMatchObject({
      consistent: true,
      missing: [],
    });
  });

  test("a claim restating both statements keeps both restrictions", () => {
    expect(
      checkConditionConsistency(
        "Employees receive 20 days of leave and contractors receive 10 days.",
        "Employees receive 20 days of leave and contractors receive 10 days if they work full time.",
      ),
    ).toMatchObject({ consistent: false, missing: ["if they work full time"] });
  });

  test("a restriction of the statement itself still counts", () => {
    expect(
      checkConditionConsistency(
        "Contractors receive 10 days.",
        "Employees receive 20 days of leave and contractors receive 10 days if they work full time.",
      ),
    ).toMatchObject({ consistent: false, missing: ["if they work full time"] });
    expect(
      checkConditionConsistency(
        "Remote work is allowed two days per week.",
        "Remote work is allowed two days per week with manager and HR approval.",
      ).consistent,
    ).toBe(false);
  });
});

describe("a claim joining two statements", () => {
  test("each statement keeps the restrictions of its own source sentence", () => {
    expect(
      checkConditionConsistency(
        "The app offers 50 GB of free cloud storage, and additional storage costs $2 per 100 GB per month.",
        "The app offers 50 GB of cloud storage at no charge for users who have verified their email address. Additional storage costs $2 per 100 GB per month.",
      ),
    ).toMatchObject({
      consistent: false,
      missing: ["who have verified their email address"],
    });
  });

  test("both statements kept is consistent", () => {
    expect(
      checkConditionConsistency(
        "Verified users get 50 GB of free cloud storage, and additional storage costs $2 per 100 GB per month.",
        "The app offers 50 GB of cloud storage at no charge for users who have verified their email address. Additional storage costs $2 per 100 GB per month.",
      ).consistent,
    ).toBe(true);
  });
});
