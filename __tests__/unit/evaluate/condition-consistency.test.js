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
