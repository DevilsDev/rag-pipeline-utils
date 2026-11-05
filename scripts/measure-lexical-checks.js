#!/usr/bin/env node
/**
 * Measure the lexical answer check on the project-written cases in
 * __tests__/fixtures/lexical-checks/cases.jsonl: for each category, how
 * many false alarms (correct claims the check wrongly fails) now pass, and
 * how many guards (real mismatches, and plain cases that must not change)
 * still give the expected verdict.
 *
 * The cases cover the false alarms the Claude benchmarks found; they were
 * written for this project and committed before any change to the checks,
 * and the published benchmark sets (RAGTruth, HaluEval, SciFact) are not
 * used to tune anything.
 *
 *   node scripts/measure-lexical-checks.js [--json]
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { checkAnswer } = require("../src/grounding/check-answer");

const FILE = path.join(
  __dirname,
  "..",
  "__tests__",
  "fixtures",
  "lexical-checks",
  "cases.jsonl",
);

async function measure() {
  const cases = fs
    .readFileSync(FILE, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
  const results = [];
  for (const c of cases) {
    const check = await checkAnswer({
      answer: c.claim,
      sources: [{ id: "source", content: c.source }],
      evaluate: false,
    });
    const verdict = check.grounded ? "supported" : "unsupported";
    results.push({ ...c, verdict, ok: verdict === c.expected });
  }
  const categories = {};
  for (const r of results) {
    const cat = (categories[r.category] = categories[r.category] || {
      falseAlarms: 0,
      falseAlarmsPassing: 0,
      guards: 0,
      guardsHolding: 0,
      failing: [],
    });
    if (r.kind === "false alarm") {
      cat.falseAlarms += 1;
      if (r.ok) cat.falseAlarmsPassing += 1;
    } else {
      cat.guards += 1;
      if (r.ok) cat.guardsHolding += 1;
    }
    if (!r.ok) cat.failing.push(r.id);
  }
  return { results, categories };
}

module.exports = { measure };

if (require.main === module) {
  measure().then(({ results, categories }) => {
    if (process.argv.includes("--json")) {
      console.log(JSON.stringify({ categories }, null, 2));
      return;
    }
    const rows = Object.entries(categories);
    const width = Math.max(...rows.map(([k]) => k.length));
    console.log(
      `${"Category".padEnd(width)}  False alarms passing  Guards holding  Failing`,
    );
    for (const [name, c] of rows) {
      console.log(
        `${name.padEnd(width)}  ${`${c.falseAlarmsPassing}/${c.falseAlarms}`.padEnd(20)}  ${`${c.guardsHolding}/${c.guards}`.padEnd(14)}  ${c.failing.join(", ")}`,
      );
    }
    const fa = results.filter((r) => r.kind === "false alarm");
    const g = results.filter((r) => r.kind !== "false alarm");
    console.log(
      `\nFalse alarms passing: ${fa.filter((r) => r.ok).length}/${fa.length}; guards holding: ${g.filter((r) => r.ok).length}/${g.length}`,
    );
  });
}
