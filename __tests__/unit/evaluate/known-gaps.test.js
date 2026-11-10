"use strict";

/**
 * Known gaps of the lexical answer check, from the loophole hunt
 * (benchmarks/fixtures/loophole-hunt-plan.md and loophole-hunt-findings.md):
 * claims that keep their source's words and numbers but change what it
 * says (roles swapped, attribution dropped, scope, comparison direction,
 * modality, time bounds, hedges, exceptions). checkAnswer supports them
 * today. This doesn't fail the suite for them; it fails when one starts
 * being caught, so the list is updated as fixes land.
 */

const fs = require("fs");
const path = require("path");
const { checkAnswer } = require("../../../src/grounding/check-answer");

const FILE = path.join(
  __dirname,
  "../../fixtures/lexical-checks/known-gaps.jsonl",
);
const gaps = fs
  .readFileSync(FILE, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

test("every known gap is labelled as one", () => {
  expect(gaps.length).toBeGreaterThan(0);
  expect(gaps.filter((g) => g.status !== "known gap")).toEqual([]);
});

test("each known gap is still missed (remove it from known-gaps.jsonl when a fix catches it)", async () => {
  const caught = [];
  for (const g of gaps) {
    const check = await checkAnswer({
      answer: g.claim,
      sources: [g.source],
      evaluate: false,
    });
    if (!check.grounded) caught.push(`${g.id} (${g.category})`);
  }
  expect(caught).toEqual([]);
});
