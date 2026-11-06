"use strict";

/**
 * Bug hunt 3 (metamorphic): transforms that must not change any sentence's
 * verdict, but do. Each test reproduces a confirmed bug offline; they fail
 * until it is fixed. Run with npm run test:bug-hunt (npm test excludes them).
 * Findings: benchmarks/fixtures/bug-hunt-findings.md.
 */

const fs = require("fs");
const path = require("path");
const { checkAnswer } = require("../../src/grounding/check-answer");
const { splitSentences } = require("../../src/evaluate/scoring");

const verdicts = async (answer, sources) => {
  const c = await checkAnswer({ answer, sources, evaluate: false });
  return c.citations
    .map((x) => (c.unsupported.includes(x.sentence) ? 0 : 1))
    .join("");
};
const cases = fs
  .readFileSync(
    path.join(__dirname, "fixtures", "metamorphic-cases.jsonl"),
    "utf8",
  )
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));

describe("sentence splitter", () => {
  // BH-3: "rate.It is rated" is one sentence, so a negated sentence is judged
  // against a merged one (RAGTruth sources have this)
  test("no space after a period still ends a sentence", () => {
    expect(
      splitSentences("Wired charging works.Wireless charging does not."),
    ).toEqual(["Wired charging works.", "Wireless charging does not."]);
  });

  test("a source with no space after its periods gives the same verdict", async () => {
    const src =
      "The phone supports 30 W wired charging. Wireless charging is not supported. It ships without a charger.";
    const claim = "Wireless charging is not supported.";
    expect(await verdicts(claim, [src.replace(/\. /g, ".")])).toBe(
      await verdicts(claim, [src]),
    );
  });

  // BH-4: list lines without final punctuation are one sentence
  test("each line of a list is its own sentence", () => {
    expect(
      splitSentences("- Wired charging works\n- Wireless charging does not"),
    ).toEqual(["- Wired charging works", "- Wireless charging does not"]);
  });

  test("a source written as a list gives the same verdict", async () => {
    const src =
      "The phone supports 30 W wired charging. Wireless charging is not supported. It ships without a charger.";
    const list = src
      .split(". ")
      .map((s) => `- ${s.replace(/\.$/, "")}`)
      .join("\n");
    const claim = "Wireless charging is not supported.";
    expect(await verdicts(claim, [list])).toBe(await verdicts(claim, [src]));
  });

  // BH-5: "a.m." / "p.m." end a "sentence"
  test("a.m. and p.m. don't end a sentence", () => {
    expect(
      splitSentences(
        "The clinic opens at 10:00 a.m. and closes at 3:00 p.m. on weekdays.",
      ),
    ).toEqual([
      "The clinic opens at 10:00 a.m. and closes at 3:00 p.m. on weekdays.",
    ]);
  });
});

describe("text normalisation", () => {
  // BH-1: zero-width characters (PDF and HTML extracts) split words
  test("zero-width characters in a source don't change the verdict", async () => {
    const claim = "Annual leave is twenty days.";
    expect(await verdicts(claim, ["An​nual le​ave is tw​enty days."])).toBe(
      await verdicts(claim, ["Annual leave is twenty days."]),
    );
  });

  // BH-2: full-width digits are not read as numbers
  test("full-width digits in a source match ASCII digits", async () => {
    const claim = "The fee is 45 dollars.";
    expect(await verdicts(claim, ["The fee is ４５ dollars."])).toBe(
      await verdicts(claim, ["The fee is 45 dollars."]),
    );
  });

  // BH-6: NBSP instead of spaces loses a dropped-condition catch (one
  // generated set; exact texts in fixtures/metamorphic-cases.jsonl)
  test("NBSP in the sources doesn't change the verdict", async () => {
    const c = cases.find((x) => x.t === "NBSP in sources");
    expect(
      await verdicts(
        c.answer,
        c.sources.map((s) => s.replace(/ /g, " ")),
      ),
    ).toBe(await verdicts(c.answer, c.sources));
  });
});

describe("sources that don't support anything", () => {
  // BH-7: IDF weights over the sources shift borderline sentences; one of
  // these flips a missed negation ("New hires ... from their very first day")
  test("duplicating a source doesn't change the verdicts", async () => {
    const c = cases.find((x) => x.t === "duplicate a source");
    expect(await verdicts(c.answer, [...c.sources, c.sources[0]])).toBe(
      await verdicts(c.answer, c.sources),
    );
  });

  test("adding an unrelated source doesn't change the verdicts", async () => {
    const c = cases.find((x) => x.t === "add an unrelated source");
    const unrelated =
      "The lighthouse on the northern headland was painted white in a later restoration of the harbour.";
    expect(await verdicts(c.answer, [...c.sources, unrelated])).toBe(
      await verdicts(c.answer, c.sources),
    );
  });
});
