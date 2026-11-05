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
  // Found by the hand review of the 3.6 benchmark run (SciFact citations,
  // RAGTruth): the clause rule wants every word the claim shares with only
  // one clause of the source sentence to sit in a clause of the claim's
  // polarity, so a subject named once, in the source's other clause, or a
  // claim's framing clause without negation, fails the claim
  "clause-07": "subject named only in the source's other, positive clause",
  "clause-08": "the claim's framing clause has no negation",
  // Units: "2 kg" vs "2,000 grams" needs unit conversion; and the reverse
  // miss, a number that matches with a different unit ("2 pounds" against
  // "2 kilograms"), needs units compared too
  "unit-01": "unit conversion (kg / grams)",
  "unit-02": "unit conversion (weeks / days)",
  "unit-03": "unit conversion (km / metres)",
  "unit-04": "unit conversion and 'one and a half' (minutes / hours)",
  "unit-05": "'half a year' (months)",
  "unit-06": "unit conversion (metres / cm)",
  "unit-g1":
    "the same number with a different unit passes (pounds / kilograms)",
  "unit-g3": "the same number with a different unit passes (miles / km)",
  "unit-g4": "the same number with a different unit passes (hours / minutes)",
  // Fractions and percentages: "three quarters" is read as 3
  "frac-01": "'three quarters' vs 75%",
  "frac-04": "'a quarter' vs 25 percent",
  "frac-g2": "'half' states no number, so 30% passes",
  // A footnote marker glued to a year reads as a decimal ("1992.1")
  "date-04": "footnote marker after a year",
  // 12-hour vs 24-hour times
  "time-01": "'9 to 5' vs '9:00 to 17:00'",
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
