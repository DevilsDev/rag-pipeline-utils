#!/usr/bin/env node
/**
 * Supplementary condition set (3.9): five paired cases where the answer
 * leaves out a contrast clause of its source. Three clauses narrow what came
 * before ("but not for guests", "except for sale items", "but only on
 * Fridays") and must be flagged; two only add something ("but it may take a
 * few minutes") and must stay grounded. Kept apart from the frozen
 * condition-dropped set and reported as its own row.
 *
 *   node benchmarks/condition-contrast-supplement.js
 *
 * Offline and lexical only: checkAnswer with evaluate: false, no judge and
 * no API key. A case is flagged when its claim is unsupported.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { checkAnswer } = require("../src/grounding/check-answer");

const CASES_FILE = path.join(
  __dirname,
  "fixtures",
  "condition-contrast-supplement.jsonl",
);

async function main() {
  const cases = fs
    .readFileSync(CASES_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const m = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const c of cases) {
    const check = await checkAnswer({
      answer: c.answer,
      sources: c.sources.map((content, i) => ({ id: `s${i + 1}`, content })),
      evaluate: false,
    });
    const flagged = check.unsupported.includes(c.claim);
    const positive = c.expected === "unsupported";
    if (positive && flagged) m.tp++;
    else if (positive) m.fn++;
    else if (flagged) m.fp++;
    else m.tn++;
    const right = flagged === positive;
    console.log(
      `${right ? "ok  " : "MISS"} ${c.id}: ${flagged ? "flagged" : "grounded"} (expected ${c.expected})`,
    );
  }
  const precision = m.tp / (m.tp + m.fp) || 0;
  const recall = m.tp / (m.tp + m.fn) || 0;
  const f1 =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;
  console.log(
    `contrast supplement: ${JSON.stringify(m)} F1 ${f1.toFixed(4)} (${cases.length} cases)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
