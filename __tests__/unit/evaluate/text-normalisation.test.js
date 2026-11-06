/**
 * Text normalisation and sentence splitting (3.9): format characters,
 * full-width forms and no-break spaces read as plain text, and sentences
 * end where a reader would end them.
 */

const {
  normalizeText,
  normalizeWithOffsets,
} = require("../../../src/evaluate/normalize-text");
const {
  splitSentences,
  tokenize,
  checkNumericConsistency,
} = require("../../../src/evaluate/scoring");
const { checkAnswer } = require("../../../src/grounding/check-answer");

describe("normalizeText", () => {
  test("removes format characters and folds width and spaces", () => {
    expect(normalizeText("An​nual­leave﻿")).toBe("Annualleave");
    expect(normalizeText("４５ days")).toBe("45 days");
    expect(normalizeText("plain text")).toBe("plain text");
  });

  test("offsets map each character back to the original", () => {
    const text = "a​b５";
    const { text: out, offsets } = normalizeWithOffsets(text);
    expect(out).toBe("ab5");
    expect(offsets).toEqual([0, 2, 3, 4]);
  });

  test("tokenize reads the normalised text", () => {
    expect(tokenize("tw​enty ４５")).toEqual(["twenty", "45"]);
  });

  test("the numeric check reads full-width digits", () => {
    expect(
      checkNumericConsistency(
        "The fee is 45 dollars.",
        "The fee is ４５ dollars.",
      ).consistent,
    ).toBe(true);
  });
});

describe("splitSentences", () => {
  test.each([
    [
      "a sentence end with no space before a capital",
      "Wired charging works.Wireless charging does not.",
      ["Wired charging works.", "Wireless charging does not."],
    ],
    [
      "a full stop before a lowercase word",
      "Doors open at 9 a.m. and close at 5 p.m. daily.",
      ["Doors open at 9 a.m. and close at 5 p.m. daily."],
    ],
    [
      "an abbreviation inside a clause",
      "Funding comes from the U.S. government. It is renewed yearly.",
      ["Funding comes from the U.S. government.", "It is renewed yearly."],
    ],
    [
      "titles and Latin abbreviations",
      "Ask Dr. Lee about cities, e.g. Paris. She knows.",
      ["Ask Dr. Lee about cities, e.g. Paris.", "She knows."],
    ],
    [
      "list items without full stops",
      "Included:\n- Breakfast\n- Parking\n\nWifi is extra.",
      ["Included:", "- Breakfast", "- Parking", "Wifi is extra."],
    ],
    [
      "numbered items and headings",
      "# Leave\n1. Annual leave\n2) Sick leave",
      ["# Leave", "1. Annual leave", "2) Sick leave"],
    ],
    [
      "a hard-wrapped paragraph stays whole",
      "The policy applies to all\nemployees and contractors.",
      ["The policy applies to all\nemployees and contractors."],
    ],
    [
      "closing quotes stay with their sentence",
      'He said "no." Then he left.',
      ['He said "no."', "Then he left."],
    ],
    [
      "abbreviations like U.S. and Node.js inside words",
      "Node.js runs in the U.S.A. too.",
      ["Node.js runs in the U.S.A. too."],
    ],
  ])("%s", (_label, text, expected) => {
    expect(splitSentences(text)).toEqual(expected);
  });

  test("sentences come back as the original text", () => {
    const text = "Fees are ４５ dollars. Refunds take 30​ days.";
    expect(splitSentences(text)).toEqual([
      "Fees are ４５ dollars.",
      "Refunds take 30​ days.",
    ]);
  });

  test.each([
    ["Rate is $65.Alcohol is not.", ["Rate is $65.", "Alcohol is not."]],
    ["Below 120/80 mmHg.Most people.", ["Below 120/80 mmHg.", "Most people."]],
    [
      "Served in the U.S.Army for years.",
      ["Served in the U.S.Army for years."],
    ],
  ])("no space after a full stop: %s", (text, expected) => {
    expect(splitSentences(text)).toEqual(expected);
  });

  test("a no-break space between sentences ends one", () => {
    expect(splitSentences("One. Two.")).toEqual(["One.", "Two."]);
  });

  test("text that is only format characters has no sentences", () => {
    expect(splitSentences("​​")).toEqual([]);
  });
});

describe("checkAnswer with extracted text", () => {
  test("zero-width characters and full-width digits in a source", async () => {
    const check = await checkAnswer({
      answer: "Annual leave is 25 days.",
      sources: ["Annual le​ave is ２５ days."],
      evaluate: false,
    });
    expect(check.grounded).toBe(true);
  });
});

describe("splitSentences time", () => {
  beforeAll(() => jest.useRealTimers());

  test.each([
    ["full stops", "Ab. "],
    ["lowercase after full stops", "ab. "],
    ["list lines", "- a\n"],
  ])("splits 400,000 characters of %s in linear time", (_label, unit) => {
    const text = unit.repeat(100000);
    const start = process.hrtime.bigint();
    splitSentences(text);
    expect(Number(process.hrtime.bigint() - start) / 1e6).toBeLessThan(3000);
  });
});
