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
