"use strict";

const {
  isNegated,
  tokenize,
  checkPolarityConsistency,
  computeSupportScore,
  prepareSource,
  prepareDocument,
} = require("../../../src/evaluate/scoring");
const { computeFaithfulness } = require("../../../src/evaluate/faithfulness");
const {
  computeContextRecall,
} = require("../../../src/evaluate/context-metrics");
const { CitationTracker } = require("../../../src/citation/citation-tracker");
const { checkAnswer } = require("../../../src/grounding/check-answer");
const rag = require("../../../src/index");

const POLICY =
  "Full-time employees receive twenty days of paid vacation per year.";

describe("isNegated", () => {
  test.each([
    ["Employees receive paid vacation", false],
    ["Employees do not receive paid vacation", true],
    ["Employees never receive paid vacation", true],
    ["Employees don't get paid vacation", true],
    ["Employees don’t get paid vacation", true],
    ["You can't carry days over", true],
    ["There is no fee", true],
    ["Remote work without approval", true],
    ["Not without approval", false],
    ["Not only employees but contractors", false],
    ["No doubt employees get vacation", false],
    ["Nothing but the policy applies", false],
  ])("%s -> %s", (text, expected) => {
    expect(isNegated(tokenize(text))).toBe(expected);
  });
});

describe("checkPolarityConsistency", () => {
  test("a negated claim against a positive source is inconsistent", () => {
    expect(
      checkPolarityConsistency(
        "Employees never receive paid vacation.",
        POLICY,
      ),
    ).toEqual({
      consistent: false,
      claimNegated: true,
      sourceSentence: POLICY,
    });
  });

  test("a positive claim against a negated source is inconsistent", () => {
    const result = checkPolarityConsistency(
      "Contractors receive paid vacation.",
      "Contractors do not receive paid vacation.",
    );
    expect(result.consistent).toBe(false);
    expect(result.claimNegated).toBe(false);
  });

  test("matching polarity is consistent, negated or not", () => {
    expect(checkPolarityConsistency(POLICY, POLICY).consistent).toBe(true);
    expect(
      checkPolarityConsistency(
        "Contractors don't receive paid vacation.",
        "Contractors do not receive paid vacation.",
      ).consistent,
    ).toBe(true);
  });

  test("compares with the closest source sentence only", () => {
    const doc =
      "Full-time employees receive twenty days of paid vacation per year. " +
      "Contractors do not receive paid vacation.";
    const wrong = checkPolarityConsistency(
      "Contractors receive paid vacation.",
      doc,
    );
    expect(wrong.consistent).toBe(false);
    expect(wrong.sourceSentence).toBe(
      "Contractors do not receive paid vacation.",
    );
    expect(
      checkPolarityConsistency("Contractors do not receive paid vacation.", doc)
        .consistent,
    ).toBe(true);
    expect(checkPolarityConsistency(POLICY, doc).consistent).toBe(true);
  });

  test("an unrelated negated sentence in the source does not matter", () => {
    const doc = `${POLICY} Unused days do not carry over.`;
    expect(
      checkPolarityConsistency(
        "Full-time employees receive paid vacation.",
        doc,
      ).consistent,
    ).toBe(true);
  });

  test("is consistent when the claim shares no words with the source", () => {
    expect(
      checkPolarityConsistency("The office is not in Paris.", POLICY),
    ).toEqual({ consistent: true, claimNegated: true, sourceSentence: null });
    expect(checkPolarityConsistency("No.", POLICY).consistent).toBe(true);
  });
});

describe("computeSupportScore with polarity", () => {
  test("a polarity mismatch keeps the score under the 0.5 threshold", () => {
    const claim = "Full-time employees do not receive paid vacation.";
    const lexical = computeSupportScore(tokenize(claim), tokenize(POLICY));
    const checked = computeSupportScore(
      tokenize(claim),
      tokenize(POLICY),
      null,
      {
        claimText: claim,
        docText: POLICY,
      },
    );
    expect(lexical).toBe(1);
    expect(checked).toBeCloseTo(0.4);
    expect(checked).toBeLessThan(0.5);
  });
});

// Regression fixtures for the grounding check. `grounded` is what the
// deterministic check returns today; paraphrases are a known limitation.
describe.each([
  [POLICY, true, "verbatim"],
  [
    "Full-time employees receive 20 days of paid vacation per year.",
    true,
    "digits for a number word",
  ],
  [
    "Full-time employees receive thirty days of paid vacation per year.",
    false,
    "wrong number",
  ],
  [
    "Full-time employees do not receive twenty days of paid vacation per year.",
    false,
    "negated",
  ],
  ["Full-time employees never receive paid vacation.", false, "never"],
  ["Full-time employees don't get paid vacation.", false, "contraction"],
  [
    "Not only do full-time employees receive paid vacation, they receive twenty days per year.",
    true,
    "not only",
  ],
  [
    "Staff working full time get 20 days of paid leave annually.",
    false,
    "paraphrase (known limitation)",
  ],
])("grounding fixture: %s", (answer, grounded, label) => {
  test(`checkAnswer, CitationTracker and computeFaithfulness agree (${label})`, async () => {
    const check = await checkAnswer({
      question: "How many vacation days do I get?",
      answer,
      sources: [{ pageContent: POLICY }],
    });
    expect(check.grounded).toBe(grounded);

    const tracked = new CitationTracker().track(answer, [
      { id: "policy", content: POLICY },
    ]);
    expect(tracked.groundednessScore).toBe(grounded ? 1 : 0);

    const faithfulness = computeFaithfulness(answer, [{ content: POLICY }]);
    expect(faithfulness.score).toBe(grounded ? 1 : 0);
  });
});

test("context recall does not count a contradicted reference claim", () => {
  const recall = computeContextRecall("Contractors receive paid vacation.", [
    { content: "Contractors do not receive paid vacation." },
  ]);
  expect(recall.score).toBe(0);
});

test("checkPolarityConsistency is exported", () => {
  expect(rag.checkPolarityConsistency).toBe(checkPolarityConsistency);
});

describe("the polarity check's per-claim memo", () => {
  // MAX_AGREED_PER_SENTENCE in src/evaluate/scoring.js
  const CAP = 1024;
  const DOC =
    "Full-time employees receive twenty days of paid vacation per year. " +
    "Contractors do not receive paid vacation.";
  const memoSizes = (prepared) =>
    prepared.memo.polarity.sentences.map((s) => s.agreed.size);

  test("stays capped on a source reused across many distinct claims", () => {
    const doc = { id: "policy", content: DOC };
    const prepared = prepareDocument(doc, doc.content);
    for (let i = 0; i < 6000; i++) {
      checkPolarityConsistency(
        `Full-time employees receive paid vacation code${i}.`,
        prepareDocument(doc, doc.content),
      );
    }
    expect(prepareDocument(doc, doc.content)).toBe(prepared);
    for (const size of memoSizes(prepared)) {
      expect(size).toBeLessThanOrEqual(CAP);
    }
    expect(Math.max(...memoSizes(prepared))).toBe(CAP);
  });

  test("gives the same verdicts before and after the memo fills", () => {
    const claims = [
      "Employees never receive paid vacation.",
      "Contractors receive paid vacation.",
      "Contractors do not receive paid vacation.",
      POLICY,
    ];
    const unseen = [
      "Full-time employees do not receive paid vacation.",
      "Contractors receive twenty days of paid vacation.",
    ];
    const prepared = prepareSource(DOC);
    const before = claims.map((c) => checkPolarityConsistency(c, prepared));
    for (let i = 0; i < 6000; i++) {
      checkPolarityConsistency(
        `Contractors do not receive paid vacation code${i}.`,
        prepared,
      );
      checkPolarityConsistency(
        `Full-time employees receive paid vacation code${i}.`,
        prepared,
      );
    }
    for (const size of memoSizes(prepared)) expect(size).toBe(CAP);
    expect(claims.map((c) => checkPolarityConsistency(c, prepared))).toEqual(
      before,
    );
    expect(unseen.map((c) => checkPolarityConsistency(c, prepared))).toEqual(
      unseen.map((c) => checkPolarityConsistency(c, DOC)),
    );
  });
});
