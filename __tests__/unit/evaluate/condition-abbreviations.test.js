/**
 * Condition check (3.9): full stops inside abbreviations in a restricting
 * clause ("U.S.", "e.g.", "i.e.", "Inc.", "No.") don't end the clause, and
 * "US" in an answer matches "U.S." in its source. Dev cases written for the
 * fix, not taken from a benchmark.
 */

const {
  checkConditionConsistency,
  splitSentences,
} = require("../../../src/evaluate/scoring");
const { checkAnswer } = require("../../../src/grounding/check-answer");

const check = (claim, source) =>
  checkConditionConsistency(claim, source, claim);

describe("a restricting clause with an abbreviation is kept whole", () => {
  test.each([
    [
      "U.S.",
      "Benefits are paid if the U.S. economy grows.",
      "if the U.S. economy grows",
    ],
    [
      "U.K.",
      "Visas are issued unless the applicant lived in the U.K. before 2020.",
      "unless the applicant lived in the U.K. before 2020",
    ],
    [
      "e.g.",
      "Meals are covered only if the trip is long e.g. overnight or abroad.",
      "only if the trip is long e.g. overnight or abroad",
    ],
    [
      "i.e.",
      "Refunds are given if the goods are faulty i.e. damaged on arrival.",
      "if the goods are faulty i.e. damaged on arrival",
    ],
    [
      "Inc.",
      "Parking is free if you work for Acme Inc. or one of its subsidiaries.",
      "if you work for Acme Inc. or one of its subsidiaries",
    ],
    [
      "No.",
      "The warranty applies only if form No. 7 is filed within a year.",
      "only if form No. 7 is filed within a year",
    ],
  ])(
    "%s: leaving the clause out reports all of it",
    (_label, source, clause) => {
      const claim = source.split(/ (?:if|only if|unless) /)[0] + ".";
      expect(check(claim, source)).toMatchObject({
        consistent: false,
        missing: [clause],
      });
    },
  );

  test.each([
    [
      "the words after U.S.",
      "Benefits are paid if the U.S. economy grows.",
      "Benefits are paid if the economy grows.",
    ],
    [
      "the words after e.g.",
      "Leave is paid if e.g. a doctor confirms the illness.",
      "Leave is paid if a doctor confirms the illness.",
    ],
    [
      "the words after Inc.",
      "Parking is free if you work for Acme Inc. or its subsidiaries.",
      "Parking is free at the subsidiaries if you are on their staff.",
    ],
    [
      "the words after No.",
      "The warranty applies only if form No. 7 is filed within a year.",
      "The warranty applies if form 7 is filed within a year.",
    ],
  ])("keeping %s keeps the clause", (_label, source, claim) => {
    expect(check(claim, source).consistent).toBe(true);
  });
});

describe('"US" in the answer matches "U.S." in the source', () => {
  test.each([
    [
      "Benefits are paid if the U.S. economy grows.",
      "Benefits are paid if the US economy grows.",
    ],
    [
      "Grants are available only if the applicant is a U.S. citizen.",
      "Grants are available only if the applicant is a US citizen.",
    ],
    [
      "Visas are issued unless the applicant lived in the U.K. before 2020.",
      "Visas are issued unless the applicant lived in the UK before 2020.",
    ],
    [
      "Benefits are paid if the US economy grows.",
      "Benefits are paid if the U.S. economy grows.",
    ],
  ])("%s / %s", (source, claim) => {
    expect(check(claim, source).consistent).toBe(true);
  });

  test("checkAnswer grounds the answer", async () => {
    const result = await checkAnswer({
      answer: "Benefits are paid if the US economy grows.",
      sources: ["Benefits are paid if the U.S. economy grows."],
      evaluate: false,
    });
    expect(result.grounded).toBe(true);
  });
});

describe("what still ends a clause or a sentence", () => {
  test("a comma after an abbreviation still ends the clause", () => {
    expect(
      check(
        "Leave is paid.",
        "Leave is paid if you hold a listed role, e.g. nursing, and staff are told.",
      ).missing,
    ).toEqual(["if you hold a listed role"]);
  });

  test('"No." before a number doesn\'t end a sentence', () => {
    expect(splitSentences("File form No. 7 within a year. Then wait.")).toEqual(
      ["File form No. 7 within a year.", "Then wait."],
    );
  });

  test('a lowercase "no." before a number still ends a sentence', () => {
    expect(splitSentences("The answer was no. 5 people agreed.")).toEqual([
      "The answer was no.",
      "5 people agreed.",
    ]);
  });
});
