#!/usr/bin/env node
/**
 * Loophole hunt (benchmarks/fixtures/loophole-hunt-plan.md, committed before
 * any case was generated): edits that keep a source's nouns and numbers but
 * change what it asserts. Nothing in src/ is changed by this script.
 *
 *   node benchmarks/loophole-hunt.js --cap=<usd>
 *
 * 1. claude-sonnet-5-5 writes 40 cases per category (30 meaning-changing,
 *    10 faithful controls) in batches of 20.
 * 2. claude-haiku-5-5 labels every pair independently; a case is confirmed
 *    when the two labels agree.
 * 3. Each case runs through checkAnswer (no judge), CitationTracker and
 *    computeFaithfulness on this tree.
 * Writes benchmarks/fixtures/loophole-hunt-cases.jsonl,
 * benchmarks/results/loophole-hunt.json and
 * __tests__/fixtures/lexical-checks/known-gaps.jsonl (confirmed misses).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { ClaudeCache } = require("./claude-cache");
const { args, environment, mapLimit } = require("./claude-common");
const { liveAnthropic } = require("../__tests__/live/live-env.js");
const { checkAnswer } = require("../src/grounding/check-answer.js");
const { CitationTracker } = require("../src/citation/citation-tracker.js");
const { computeFaithfulness } = require("../src/evaluate/faithfulness.js");

const ROOT = path.join(__dirname, "..");
const CASES_FILE = path.join(
  __dirname,
  "fixtures",
  "loophole-hunt-cases.jsonl",
);
const RESULTS_FILE = path.join(__dirname, "results", "loophole-hunt.json");
const GAPS_FILE = path.join(
  ROOT,
  "__tests__",
  "fixtures",
  "lexical-checks",
  "known-gaps.jsonl",
);
const GENERATOR = "claude-sonnet-5-5";
const CONFIRMER = "claude-haiku-5-5";

const CATEGORIES = [
  [
    "quantifier-scope",
    "Change a quantifier or the scope of who/what it applies to (all vs full-time employees, some vs all, most vs every).",
  ],
  [
    "modality",
    "Change the modality (may vs must, should vs will, can vs is required to).",
  ],
  [
    "time-bounds",
    "Remove or change a time bound (until, before, after, by <date>, within <period> made open-ended).",
  ],
  [
    "hedge-removed",
    'Remove a hedge so the claim is more absolute ("up to $60" becomes "$60", "about", "approximately", "typically", "in most cases" dropped).',
  ],
  [
    "comparison-direction",
    "Reverse a comparison (at least vs at most, more vs fewer, higher vs lower, exceeds vs falls short of), keeping the same numbers.",
  ],
  [
    "role-swap",
    'Swap the roles of two actors ("the employer pays the employee" vs the reverse, "the landlord notifies the tenant" vs the reverse).',
  ],
  [
    "exception-dropped",
    'Drop an exception from a list ("all fees except the setup fee are refundable" becomes "all fees are refundable"), keeping the other items.',
  ],
  [
    "attribution-dropped",
    'Drop the attribution so a reported or tentative finding becomes a flat fact ("the study suggests X" becomes "X", "according to the vendor" dropped).',
  ],
];

function generationPrompt(category, how, k) {
  return `You write test cases for a library that checks whether a claim is supported by its source.
Category: ${category}. ${how}
Write exactly 20 cases. Cases 1 to 15 are "changed": the claim keeps the source's nouns and numbers (and most of its words) but changes what it asserts in this category's way, so the source does NOT support it. Cases 16 to 20 are "control": a faithful paraphrase of the source that the source DOES support.
Use realistic one- or two-sentence sources, rotating domains: workplace policy, contracts, medical guidance, product terms. Batch ${k} of 2: do not repeat subjects from the other batch (batch 1 uses the first half of the alphabet for its main subject nouns, batch 2 the second half).
Each case: {"kind": "changed"|"control", "source": "...", "claim": "...", "domain": "..."}.
Reply with ONLY a JSON array, no prose and no code fence.`;
}

function confirmPrompt(source, claim) {
  return `Source: ${JSON.stringify(source)}
Claim: ${JSON.stringify(claim)}
Does the source fully support the claim, with no change of meaning (scope, modality, time, hedging, comparison direction, who does what, exceptions, attribution)? Reply with one word: SUPPORTED or UNSUPPORTED.`;
}

const parse = (text) =>
  JSON.parse(
    String(text)
      .trim()
      .replace(/^```(?:json)?\s*|\s*```$/g, ""),
  );

async function main() {
  const cap = Number(args.cap);
  if (!Number.isFinite(cap)) throw new Error("--cap=<usd> is required");
  const { apiKey } = liveAnthropic();
  const cache = new ClaudeCache({ apiKey, capUSD: cap });

  // 1. Generate
  const cases = [];
  for (const [category, how] of CATEGORIES) {
    for (const k of [1, 2]) {
      const r = await cache.messages({
        model: GENERATOR,
        max_tokens: 8000,
        messages: [
          { role: "user", content: generationPrompt(category, how, k) },
        ],
      });
      let items = [];
      try {
        items = parse((r.data.content || []).map((b) => b.text || "").join(""));
      } catch (e) {
        console.error(`${category} batch ${k}: unparseable (${e.message})`);
      }
      const good = items.filter(
        (c) =>
          c &&
          ["changed", "control"].includes(c.kind) &&
          typeof c.source === "string" &&
          typeof c.claim === "string" &&
          c.source.trim() &&
          c.claim.trim(),
      );
      good.forEach((c, i) =>
        cases.push({
          id: `lh-${category}-${k}-${String(i + 1).padStart(2, "0")}`,
          category,
          kind: c.kind,
          expected: c.kind === "changed" ? "unsupported" : "supported",
          source: c.source.trim(),
          claim: c.claim.trim(),
          domain: c.domain || null,
          generator: GENERATOR,
        }),
      );
      console.log(`${category} batch ${k}: ${good.length} cases`);
    }
  }

  // 2. Confirm
  await mapLimit(cases, 6, async (c) => {
    const r = await cache.messages({
      model: CONFIRMER,
      max_tokens: 10,
      messages: [{ role: "user", content: confirmPrompt(c.source, c.claim) }],
    });
    const word = (r.data.content || [])
      .map((b) => b.text || "")
      .join("")
      .trim()
      .toUpperCase();
    c.confirmer = CONFIRMER;
    c.confirmerLabel = word.startsWith("UNSUPPORTED")
      ? "unsupported"
      : word.startsWith("SUPPORTED")
        ? "supported"
        : "unclear";
    c.confirmed = c.confirmerLabel === c.expected;
  });

  // 3. Run the library
  for (const c of cases) {
    const check = await checkAnswer({
      answer: c.claim,
      sources: [c.source],
      evaluate: false,
    });
    const tracked = new CitationTracker().track(c.claim, [
      { id: "s1", content: c.source },
    ]);
    const faith = computeFaithfulness(c.claim, [{ content: c.source }]);
    c.results = {
      checkAnswer: check.grounded ? "supported" : "unsupported",
      citationTracker:
        tracked.groundednessScore >= 0.5 ? "supported" : "unsupported",
      faithfulness: faith.score >= 0.5 ? "supported" : "unsupported",
      faithfulnessScore: Number(faith.score.toFixed(3)),
    };
  }

  fs.writeFileSync(
    CASES_FILE,
    cases
      .map((c) =>
        JSON.stringify({
          ...c,
          review: "generator and confirmer labels, not human review",
        }),
      )
      .join("\n") + "\n",
  );

  // Per category
  const surfaces = ["checkAnswer", "citationTracker", "faithfulness"];
  const perCategory = {};
  for (const [category] of CATEGORIES) {
    const mine = cases.filter((c) => c.category === category);
    const changed = mine.filter((c) => c.kind === "changed" && c.confirmed);
    const controls = mine.filter((c) => c.kind === "control" && c.confirmed);
    const row = {
      generated: mine.length,
      changedConfirmed: changed.length,
      controlsConfirmed: controls.length,
      disagreements: mine.filter((c) => !c.confirmed).length,
    };
    for (const s of surfaces) {
      const missed = changed.filter((c) => c.results[s] === "supported").length;
      const falseAlarms = controls.filter(
        (c) => c.results[s] === "unsupported",
      ).length;
      row[s] = {
        missed,
        missRate: changed.length ? missed / changed.length : null,
        falseAlarms,
        falseAlarmRate: controls.length ? falseAlarms / controls.length : null,
      };
    }
    row.examples = changed
      .filter((c) => c.results.checkAnswer === "supported")
      .slice(0, 3)
      .map((c) => ({ id: c.id, source: c.source, claim: c.claim }));
    perCategory[category] = row;
  }
  const report = {
    generatedAt: new Date().toISOString(),
    environment: environment(),
    plan: "benchmarks/fixtures/loophole-hunt-plan.md",
    generator: GENERATOR,
    confirmer: CONFIRMER,
    note: "claude-sonnet-5-5 and claude-haiku-5-5 reject temperature; both ran at their defaults",
    n: cases.length,
    perCategory,
    spend: cache.usageSummary(),
  };
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(report, null, 2) + "\n");

  // Confirmed misses of checkAnswer -> known gaps (the suite fails only if
  // one starts passing)
  const gaps = cases.filter(
    (c) =>
      c.kind === "changed" &&
      c.confirmed &&
      c.results.checkAnswer === "supported",
  );
  fs.writeFileSync(
    GAPS_FILE,
    gaps
      .map((c) =>
        JSON.stringify({
          id: c.id,
          category: c.category,
          status: "known gap",
          expected: "unsupported",
          claim: c.claim,
          source: c.source,
        }),
      )
      .join("\n") + "\n",
  );

  const ranked = Object.entries(perCategory).sort(
    (a, b) =>
      (b[1].checkAnswer.missRate ?? 0) - (a[1].checkAnswer.missRate ?? 0),
  );
  for (const [category, r] of ranked) {
    console.log(
      `${category.padEnd(22)} miss ${r.checkAnswer.missed}/${r.changedConfirmed} (${((r.checkAnswer.missRate ?? 0) * 100).toFixed(0)}%)  CT ${r.citationTracker.missed}  faith ${r.faithfulness.missed}  | false alarms ${r.checkAnswer.falseAlarms}/${r.controlsConfirmed}  | disagreements ${r.disagreements}`,
    );
  }
  console.log(`${gaps.length} known gaps -> ${path.relative(ROOT, GAPS_FILE)}`);
  console.log(`cache spend now US$${cache.spentUSD().toFixed(4)} (cap ${cap})`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
