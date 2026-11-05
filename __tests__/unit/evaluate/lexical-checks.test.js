"use strict";

/**
 * The lexical answer check on the project-written cases in
 * __tests__/fixtures/lexical-checks/cases.jsonl (committed before 3.6
 * changed the checks): every case gives its expected verdict, except the
 * known misses listed below, which no rule here covers yet.
 *
 * These cases are the development set for the 3.6 changes. The measure of
 * those changes is the Claude benchmarks on the published sets, run once
 * after the code was frozen; nothing is tuned on them.
 */

const { measure } = require("../../../scripts/measure-lexical-checks");

/** Known misses, by case id, with why. Remove an id when a rule covers it. */
const KNOWN_MISSES = {
  // Only exact conversions are made: a month is not a fixed number of days
  "unit-09": "approximate conversion (1 month / 30 days)",
};

let results;
beforeAll(async () => {
  ({ results } = await measure());
});

test("every case gives its expected verdict, except the known misses", () => {
  const wrong = results
    .filter((r) => !r.ok && !(r.id in KNOWN_MISSES))
    .map(
      (r) =>
        `${r.id} (${r.category}): expected ${r.expected}, got ${r.verdict}`,
    );
  expect(wrong).toEqual([]);
});

test("each known miss is still a miss (remove it from the list when fixed)", () => {
  const fixed = results
    .filter((r) => r.id in KNOWN_MISSES && r.ok)
    .map((r) => r.id);
  expect(fixed).toEqual([]);
});

test("the known-miss list names real cases", () => {
  const ids = new Set(results.map((r) => r.id));
  expect(Object.keys(KNOWN_MISSES).filter((id) => !ids.has(id))).toEqual([]);
});
