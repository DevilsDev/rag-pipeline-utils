"use strict";

const {
  tokenize,
  extractNumbers,
  checkNumericConsistency,
  computeSupportScore,
} = require("../../../src/evaluate/scoring");
const { mapSentenceToSources } = require("../../../src/citation/source-mapper");

describe("extractNumbers", () => {
  test.each([
    ["Employees get thirty days", ["30"]],
    ["Up to 4.5% of 1,000 users", ["4.5", "1000"]],
    ["two hundred and five people", ["205"]],
    ["twenty-five years", ["25"]],
    ["Twenty Five", ["25"]],
    ["one hundred", ["100"]],
    ["three thousand four hundred", ["3400"]],
    ["at 30% or 30 percent", ["30", "30"]],
    ["no one knows; one of them", []],
    ["BM25 and GPT4 models", []],
    ["Five days.", ["5"]],
    ["items 1,2,3", ["1", "2", "3"]],
  ])("%s", (text, expected) => {
    expect(extractNumbers(text).values).toEqual(expected);
  });
});

describe("checkNumericConsistency", () => {
  test.each([
    ["thirty days", "twenty days", false],
    ["twenty days", "twenty days", true],
    ["20 days", "twenty days", true],
    ["twenty days", "20 days", true],
    ["4.5% growth", "growth of 4.5 percent", true],
    ["4.6% growth", "growth of 4.5 percent", false],
    ["200 staff", "two hundred staff", true],
    ["no numbers here", "twenty days", true],
    ["5 and 7 days", "5 days", false],
  ])("%s vs %s -> %s", (claim, doc, consistent) => {
    expect(checkNumericConsistency(claim, doc).consistent).toBe(consistent);
  });
});

describe("computeSupportScore numeric check", () => {
  const doc = "Employees receive twenty days of paid vacation per year.";
  const claim = "Employees receive thirty days of paid vacation per year.";

  test("is lexical only without the raw texts (backward compatible)", () => {
    const score = computeSupportScore(tokenize(claim), tokenize(doc));
    expect(score).toBeGreaterThan(0.5);
  });

  test("drops below the 0.5 threshold on a number mismatch", () => {
    const score = computeSupportScore(tokenize(claim), tokenize(doc), null, {
      claimText: claim,
      docText: doc,
    });
    expect(score).toBeLessThan(0.5);
  });

  test("partial number match stays below 0.4", () => {
    const partial =
      "Employees receive twenty days and five sick days per year.";
    const score = computeSupportScore(tokenize(partial), tokenize(doc), null, {
      claimText: partial,
      docText: doc,
    });
    expect(score).toBeLessThan(0.4);
  });

  test("source-mapper does not cite a document with a different number", () => {
    const docs = [{ id: "policy", content: doc }];
    expect(mapSentenceToSources(claim, docs)).toEqual([]);
    expect(mapSentenceToSources(doc, docs)[0].docId).toBe("policy");
  });
});

describe("quantities with units (3.7)", () => {
  const ok = (claim, doc) => checkNumericConsistency(claim, doc).consistent;

  test.each([
    ["2 kg", "2,000 grams"],
    ["2 weeks", "14 days"],
    ["5 km", "5,000 metres"],
    ["90 minutes", "one and a half hours"],
    ["6 months", "half a year"],
    ["1.5 metres", "150 cm"],
    ["10 per cent", "10%"],
    ["three quarters of staff", "75% of staff"],
    ["a third of the budget", "33% of the budget"],
    ["20 days", "20 vacation days"],
  ])("%s matches %s", (claim, doc) => {
    expect(ok(`It is ${claim}.`, `It is ${doc}.`)).toBe(true);
  });

  test.each([
    ["2 pounds", "2 kilograms"],
    ["90 hours", "90 minutes"],
    ["3 weeks", "3 days"],
    ["2 grams", "2,000 grams"],
    ["half of the patients", "30% of the patients"],
    ["4.6% growth", "growth of 4.5 percent"],
  ])("%s does not match %s", (claim, doc) => {
    expect(ok(`It is ${claim}.`, `It is ${doc}.`)).toBe(false);
  });

  test("only exact conversions: a month is not 30 days", () => {
    expect(ok("It ran for 1 month.", "It ran for 30 days.")).toBe(false);
  });

  test("a bare 'half' is not a number", () => {
    expect(ok("Sales fell in the second half.", "Sales fell 40%.")).toBe(true);
  });

  test("a unit the source doesn't state falls back to the plain number", () => {
    expect(ok("The fee is 5 percent.", "The fee is 5 and rising.")).toBe(true);
    expect(ok("It weighs 3 kg.", "It weighs about 4.")).toBe(false);
  });
});

describe("clock times (3.7)", () => {
  const ok = (claim, doc) => checkNumericConsistency(claim, doc).consistent;

  test("12-hour times match 24-hour clock times", () => {
    expect(ok("Open from 9 to 5.", "Open from 9:00 to 17:00.")).toBe(true);
    expect(ok("It closes at 5 pm.", "It closes at 17:00.")).toBe(true);
    expect(ok("It opens at 10 am.", "It opens at 10:00.")).toBe(true);
  });

  test("a wrong hour does not", () => {
    expect(ok("It closes at 6.", "It closes at 17:00.")).toBe(false);
    expect(ok("Open from 8 to 5.", "Open from 9:00 to 17:00.")).toBe(false);
    expect(ok("It closes at 5 am.", "It closes at 17:00.")).toBe(false);
  });

  test("only checked against a source with clock times", () => {
    expect(ok("We met at 5.", "We met at 5 and left at 6.")).toBe(true);
  });
});

describe("footnote markers after a year (3.7)", () => {
  test("the year is read from 1992.1 before a new sentence", () => {
    const doc = "It was published in 1992.1 It enrolled adults.";
    expect(checkNumericConsistency("Published in 1992.", doc).consistent).toBe(
      true,
    );
    expect(checkNumericConsistency("Published in 1993.", doc).consistent).toBe(
      false,
    );
  });
});
