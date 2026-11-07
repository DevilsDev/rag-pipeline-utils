"use strict";

/**
 * The condition check: a claim that keeps every noun and number of its
 * source but drops a restriction on it (an approval, a condition, an
 * exception, an eligibility rule) grants more than the source does, and is
 * not grounded. Dropping a contrasting clause ("..., but not in children")
 * leaves a narrower claim that is still true, and stays grounded.
 */

const {
  tokenize,
  checkConditionConsistency,
  computeSupportScore,
  CONDITION_MISMATCH_FACTOR,
} = require("../../../src/evaluate/scoring");
const { computeFaithfulness } = require("../../../src/evaluate/faithfulness");
const { CitationTracker } = require("../../../src/citation/citation-tracker");
const { checkAnswer } = require("../../../src/grounding/check-answer");
const rag = require("../../../src/index");

const REMOTE =
  "Remote work is allowed two days per week with manager approval.";
const DROPPED = "Remote work is allowed two days per week.";

describe("checkConditionConsistency", () => {
  test.each([
    ["with ... approval", DROPPED, REMOTE, "with manager approval"],
    [
      "only if",
      "Employees can carry over five vacation days.",
      "Employees can carry over five vacation days only if their manager signs off by December 1.",
      "only if their manager signs off by December 1",
    ],
    [
      "unless",
      "The refund is issued within 14 days.",
      "The refund is issued within 14 days unless the item was damaged by the customer.",
      "unless the item was damaged by the customer",
    ],
    [
      "after <number> <unit>",
      "Contractors receive a $500 equipment stipend.",
      "Contractors receive a $500 equipment stipend after 90 days of service.",
      "after 90 days of service",
    ],
    [
      "subject to",
      "Staff may expense meals up to $60 per day.",
      "Staff may expense meals up to $60 per day, subject to finance approval.",
      "subject to finance approval",
    ],
    [
      "provided",
      "Visitors may enter the lab.",
      "Visitors may enter the lab provided they are escorted by a badge holder.",
      "provided they are escorted by a badge holder",
    ],
    [
      "for <people> with",
      "Parental leave is 16 weeks.",
      "Parental leave is 16 weeks for employees with at least one year of service.",
      "with at least one year of service",
    ],
    [
      "if",
      "Members may bring a guest.",
      "Members may bring a guest if they book a day in advance.",
      "if they book a day in advance",
    ],
    [
      "as long as",
      "Pets are allowed in the office.",
      "Pets are allowed in the office as long as they stay on a lead.",
      "as long as they stay on a lead",
    ],
    [
      "except",
      "All staff get a laptop.",
      "All staff get a laptop except contractors.",
      "except contractors",
    ],
  ])("%s left out is inconsistent", (_marker, claim, source, missing) => {
    expect(checkConditionConsistency(claim, source)).toEqual({
      consistent: false,
      missing: [missing],
      sourceSentence: source,
    });
  });

  test.each([
    [
      "the condition kept, reworded",
      "With their manager's approval, employees may work remotely two days a week.",
      REMOTE,
    ],
    [
      "the condition as a verb",
      "Remote work is allowed two days per week if a manager approves it.",
      REMOTE,
    ],
    [
      "a separate statement left out",
      DROPPED,
      "Remote work is allowed two days per week, and the office is open on weekends.",
    ],
    [
      "a contrasting clause left out",
      "The drug reduced blood pressure in adults.",
      "The drug reduced blood pressure in adults, but not in children under twelve.",
    ],
    [
      "a leading condition kept",
      "If a manager approves, remote work is allowed two days per week.",
      "If approved by a manager, remote work is allowed two days per week.",
    ],
    [
      "no restriction in the source",
      DROPPED,
      "Remote work is allowed two days per week.",
    ],
    [
      "a restriction in another sentence of the source",
      DROPPED,
      "Remote work is allowed two days per week. Travel is reimbursed only if booked through the portal.",
    ],
  ])("%s is consistent", (_name, claim, source) => {
    expect(checkConditionConsistency(claim, source).consistent).toBe(true);
  });

  test("a condition restated elsewhere in the answer counts as kept", () => {
    const answer = `${DROPPED} You'll need your manager's approval.`;
    expect(checkConditionConsistency(DROPPED, REMOTE, answer).consistent).toBe(
      true,
    );
    expect(checkConditionConsistency(DROPPED, REMOTE).consistent).toBe(false);
  });

  test("an empty claim or no shared words is consistent (nothing to check)", () => {
    expect(checkConditionConsistency("", REMOTE).consistent).toBe(true);
    expect(
      checkConditionConsistency("Lunch is served at noon.", REMOTE).consistent,
    ).toBe(true);
  });
});

describe("computeSupportScore with the condition check", () => {
  test("a dropped condition multiplies the score by CONDITION_MISMATCH_FACTOR", () => {
    const tokens = tokenize(DROPPED);
    const docSet = new Set(tokenize(REMOTE));
    const plain = computeSupportScore(tokens, docSet);
    const checked = computeSupportScore(tokens, docSet, null, {
      claimText: DROPPED,
      docText: REMOTE,
    });
    expect(plain).toBe(1);
    expect(checked).toBeCloseTo(plain * CONDITION_MISMATCH_FACTOR);
    expect(checked).toBeLessThan(0.5);
  });

  test("answerText that restates the condition keeps the full score", () => {
    const score = computeSupportScore(
      tokenize(DROPPED),
      new Set(tokenize(REMOTE)),
      null,
      {
        claimText: DROPPED,
        docText: REMOTE,
        answerText: `${DROPPED} Your manager has to approve it.`,
      },
    );
    expect(score).toBe(1);
  });
});

describe("the check through the public API", () => {
  test("checkAnswer flags the dropped condition", async () => {
    const check = await checkAnswer({
      answer: DROPPED,
      sources: [REMOTE],
      evaluate: false,
    });
    expect(check.grounded).toBe(false);
    expect(check.unsupported).toEqual([DROPPED]);
  });

  test("checkAnswer keeps a sentence grounded when the condition is restated in another sentence", async () => {
    const check = await checkAnswer({
      answer: `${DROPPED} You'll need your manager's approval.`,
      sources: [REMOTE],
      evaluate: false,
    });
    expect(check.unsupported).not.toContain(DROPPED);
    expect(check.citations[0].sources).toHaveLength(1);
  });

  // The example in Evaluation.md ("Known limitations"): both sentences are
  // supported, so the whole answer is grounded. "You'll need your manager's
  // approval." would not be: it fails on word overlap on its own.
  test("checkAnswer grounds the documented answer that restates the condition", async () => {
    const check = await checkAnswer({
      answer:
        "Remote work is allowed two days per week. Remote work requires manager approval.",
      sources: [REMOTE],
      evaluate: false,
    });
    expect(check.grounded).toBe(true);
    expect(check.unsupported).toEqual([]);
  });

  test("CitationTracker and faithfulness see it too", () => {
    const tracked = new CitationTracker().track(DROPPED, [
      { id: "remote", content: REMOTE },
    ]);
    expect(tracked.groundednessScore).toBe(0);
    expect(
      computeFaithfulness(DROPPED, [{ content: REMOTE }]).score,
    ).toBeLessThan(0.5);
  });

  test("exported from the main entry", () => {
    expect(rag.checkConditionConsistency).toBe(checkConditionConsistency);
  });
});

// Changes made from the condition-dropped benchmark's dev split
// (benchmarks/fixtures/condition-dropped-plan.md), before the test split ran
describe("from the condition-dropped dev split", () => {
  test("a restriction word the main statement also uses doesn't show it was kept", () => {
    expect(
      checkConditionConsistency(
        "Employees must report a workplace injury to their supervisor within 24 hours.",
        "Employees must report a workplace injury to their supervisor within 24 hours if the injury requires medical treatment beyond basic first aid.",
      ).consistent,
    ).toBe(false);
  });

  test("a word in another sentence counts only when this source supports that sentence", () => {
    const source =
      "Employees may attend one external conference per year, subject to budget availability.";
    const claim = "Employees may attend one external conference per year.";
    // from another source: doesn't restate the proviso
    expect(
      checkConditionConsistency(
        claim,
        source,
        `The annual budget review takes place in November. ${claim}`,
      ).consistent,
    ).toBe(false);
    // from this source: does
    expect(
      checkConditionConsistency(
        claim,
        source,
        `${claim} Attendance is subject to budget availability.`,
      ).consistent,
    ).toBe(true);
  });

  test.each([
    [
      "even if",
      "Refunds are issued within 10 days even if the item was opened.",
    ],
    [
      "if any",
      "Patients should report all side effects, if any, to their physician within 48 hours.",
    ],
    [
      "if applicable",
      "Refunds are issued within 10 business days, less any restocking fee, if applicable.",
    ],
  ])("%s does not restrict the statement", (_name, source) => {
    const claim = source
      .replace(/,? (?:even if|if any|if applicable)[^,.]*,?/, "")
      .replace(/\s+\./, ".");
    expect(checkConditionConsistency(claim, source).consistent).toBe(true);
  });

  test("a coordinator inside the restriction keeps it whole", () => {
    expect(
      checkConditionConsistency(
        "Employees may work remotely up to three days per week.",
        "Employees may work remotely up to three days per week with manager and HR approval.",
      ),
    ).toEqual(
      expect.objectContaining({
        consistent: false,
        missing: ["with manager and HR approval"],
      }),
    );
  });
});

// Patterns first seen as false alarms on the public sets (RAGTruth, Phase D
// of the 3.9 checks); these dev cases were written for the fix, not copied
// from those sets
describe("non-restricting phrases and sources without sentence spaces", () => {
  test.each([
    [
      "if necessary, between commas",
      "The technician will replace the filter during the annual service.",
      "The technician will replace the filter, if necessary, during the annual service.",
    ],
    [
      "if needed, closing the sentence",
      "Staff can call the on-call engineer after hours.",
      "Staff can call the on-call engineer after hours if needed.",
    ],
    [
      "if possible, before and",
      "Guests should bring a printed ticket and arrive early.",
      "Guests should bring a printed ticket if possible and arrive early.",
    ],
    [
      "anaphoric If not,",
      "If no referral is needed, you can book the appointment online.",
      "Ask the clinic whether a referral is needed. If not, you can book the appointment online.",
    ],
    [
      "anaphoric If so,",
      "Swollen batteries must be taken to a recycling point.",
      "Check whether the battery is swollen. If so, it must be taken to a recycling point.",
    ],
    [
      "if need be",
      "The team will work on Saturday to finish the audit.",
      "The team will work on Saturday, if need be, to finish the audit.",
    ],
    [
      "missing space before the next sentence's restriction",
      "Visitors must sign in at reception.",
      "Visitors must sign in at reception.Visitors may park in the staff car park if they show a badge.",
    ],
    [
      "missing space, If at the start of the next sentence",
      "The library opens at eight on weekdays.",
      "The library opens at eight on weekdays.If you need a study room, book it online.",
    ],
    [
      "except as required by law",
      "Customer data is never shared with third parties.",
      "Customer data is never shared with third parties except as required by law.",
    ],
    [
      "except as permitted by law",
      "Recordings are deleted after 30 days.",
      "Recordings are deleted after 30 days, except as permitted by law.",
    ],
    [
      "to the extent permitted by law",
      "The supplier is not liable for indirect losses.",
      "To the extent permitted by law, the supplier is not liable for indirect losses.",
    ],
    [
      "as required by applicable law",
      "The clinic keeps patient records for seven years.",
      "The clinic keeps patient records for seven years, as required by applicable law.",
    ],
  ])("%s is not a dropped condition", (_name, claim, source) => {
    expect(checkConditionConsistency(claim, source).consistent).toBe(true);
  });

  test.each([
    [
      "if necessary + noun is a real condition",
      "The grant is paid in June.",
      "The grant is paid in June if necessary documents are filed by May.",
      "if necessary documents are filed by May",
    ],
    [
      "If not + words is a real condition",
      "The invoice incurs a 5% fee.",
      "If not paid by Friday, the invoice incurs a 5% fee.",
      "If not paid by Friday",
    ],
    [
      "if so + words is a real condition",
      "The hearing is held in private.",
      "The hearing is held in private if so ordered by the judge.",
      "if so ordered by the judge",
    ],
    [
      "a restriction in its own sentence after a missing space",
      "Refunds are issued at the counter.",
      "Payments are accepted by card.Refunds are issued at the counter only if the receipt is shown.",
      "only if the receipt is shown",
    ],
    [
      "except for an item, not the law",
      "Refunds are issued within 14 days.",
      "Refunds are issued within 14 days except for sale items.",
      "except for sale items",
    ],
  ])("%s", (_name, claim, source, missing) => {
    expect(checkConditionConsistency(claim, source)).toEqual(
      expect.objectContaining({ consistent: false, missing: [missing] }),
    );
  });
});

describe("conditionCheck: false (scores as on 3.8)", () => {
  const source =
    "Remote work is allowed two days per week with manager approval.";
  const answer = "Remote work is allowed two days per week.";

  test("checkAnswer grounds a sentence that leaves out the condition", async () => {
    const on = await checkAnswer({
      answer,
      sources: [source],
      evaluate: false,
    });
    const off = await checkAnswer({
      answer,
      sources: [source],
      evaluate: false,
      conditionCheck: false,
    });
    expect(on.grounded).toBe(false);
    expect(off.grounded).toBe(true);
  });

  test("CitationTracker and computeSupportScore take the option", () => {
    const on = new CitationTracker().track(answer, [{ content: source }]);
    const off = new CitationTracker({ conditionCheck: false }).track(answer, [
      { content: source },
    ]);
    expect(on.groundednessScore).toBe(0);
    expect(off.groundednessScore).toBe(1);
  });

  test("the judge path neither fails nor blocks on the condition", async () => {
    const judge = {
      generate: async () => {
        throw new Error("not called: nothing failed for low overlap");
      },
    };
    const on = await checkAnswer({
      answer,
      sources: [{ id: "a", content: source }],
      evaluate: false,
      judge,
    });
    const off = await checkAnswer({
      answer,
      sources: [{ id: "a", content: source }],
      evaluate: false,
      judge,
      conditionCheck: false,
    });
    expect(on.judge.verdicts[0].lexicalReason).toBe("condition_mismatch");
    expect(off.grounded).toBe(true);
    expect(off.judge.verdicts[0].lexicalReason).toBe("supported");
  });

  test("toBeGroundedIn takes the option", () => {
    const { toBeGroundedIn } = require("../../../src/testing/matchers");
    expect(toBeGroundedIn(answer, [source]).pass).toBe(false);
    expect(
      toBeGroundedIn(answer, [source], { conditionCheck: false }).pass,
    ).toBe(true);
  });
});

describe("conditionCheck: false reaches the evaluation metrics", () => {
  const sources = [
    {
      id: "a",
      content:
        "Remote work is allowed two days per week with manager approval. Equipment is provided by the company.",
    },
  ];
  const args = {
    answer:
      "Remote work is allowed two days per week. Equipment is provided by the company.",
    sources,
    question: "How many days of remote work are allowed?",
    referenceAnswer: "Remote work is allowed two days per week.",
  };

  test("checkAnswer's evaluation", async () => {
    const on = await checkAnswer(args);
    const off = await checkAnswer({ ...args, conditionCheck: false });
    expect(on.evaluation.scores).toMatchObject({
      faithfulness: 0.5,
      contextRecall: 0,
    });
    expect(off.evaluation.scores).toMatchObject({
      faithfulness: 1,
      contextRecall: 1,
      groundedness: 1,
    });
  });

  test("a pipeline run with citationOptions", async () => {
    const pipeline = rag.createRagPipeline({
      embedder: { embed: async () => [1, 0] },
      retriever: { retrieve: async () => sources },
      llm: { generate: async () => args.answer },
    });
    const run = (citationOptions) =>
      pipeline.run({
        query: args.question,
        options: {
          citations: true,
          evaluate: true,
          referenceAnswer: args.referenceAnswer,
          ...(citationOptions && { citationOptions }),
        },
      });
    const on = await run();
    const off = await run({ conditionCheck: false });
    expect(on.evaluation.scores.contextRecall).toBe(0);
    expect(off.citations.groundednessScore).toBe(1);
    expect(off.evaluation.scores).toMatchObject({
      faithfulness: 1,
      contextRecall: 1,
      groundedness: 1,
    });
  });
});
