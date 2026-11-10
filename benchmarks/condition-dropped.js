#!/usr/bin/env node
/**
 * Condition-dropped benchmark (benchmarks/fixtures/condition-dropped-plan.md,
 * committed before any case was generated).
 *
 *   node benchmarks/condition-dropped.js generate --cap=<usd>
 *     claude-sonnet-5-5 writes 350 cases in 14 batches (temperature 0, the
 *     prompts below), validated and split dev/test by seed 20261108, into
 *     benchmarks/fixtures/condition-dropped-cases.jsonl, every case marked
 *     "needs human review".
 *   node benchmarks/condition-dropped.js run --cap=<usd> [--before=<dir>]
 *     [--output=benchmarks/results/condition-dropped.json]
 *     Lexical and judge (claude-haiku-5-5, claude-sonnet-5-5) runs on the
 *     3.8.0 code (--before: a checkout of v3.8.0 with node_modules) and on
 *     this tree. A case is scored on its target sentence: flagged when that
 *     sentence is unsupported. The answer-level verdict is reported too.
 *
 * Responses are cached in benchmarks/.data/claude-cache/; --cap is the
 * cache's cumulative spend limit (benchmarks/claude-cache.js).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { ClaudeCache } = require("./claude-cache");
const {
  args,
  environment,
  confusionMetrics,
  mapLimit,
} = require("./claude-common");
const { liveAnthropic } = require("../__tests__/live/live-env.js");

const CASES_FILE = path.join(
  __dirname,
  "fixtures",
  "condition-dropped-cases.jsonl",
);
const GENERATOR = "claude-sonnet-5-5";
const JUDGES = ["claude-haiku-5-5", "claude-sonnet-5-5"];
const SEED = 20261108;
const DOMAINS = [
  "workplace policy",
  "contracts",
  "medical guidance",
  "product terms",
];

const COMMON = `You write test cases for a library that checks whether each sentence of an answer is supported by its source documents.
Write realistic text from four domains, in equal shares and rotating in this order: ${DOMAINS.join(", ")}.
Each case has "sources" (an array of 1 or 2 source passages, each 1 or 2 sentences), "answer" (1 or 2 sentences), "claim" (the one sentence of the answer under test, copied exactly from "answer") and "domain".
Use varied subjects, numbers and wording; no two cases may share a source.
Reply with ONLY a JSON array of objects, no prose and no code fence.`;

/** One batch per stratum: [stratum, label, count, instructions]. */
const BATCHES = [
  [
    "approval",
    "unsupported",
    25,
    `Each source states a rule restricted by an approval: "with ... approval", "with ... permission", "with ... consent", "with ... sign-off" or "with ... authorization". The answer is one sentence (the claim) that keeps the rule's main statement and all its numbers but leaves the approval out completely (no word of the approval clause appears).`,
  ],
  [
    "condition",
    "unsupported",
    25,
    `Each source states a rule restricted by a condition introduced by "only if", "only when" or "if" (vary them). The answer is one sentence (the claim) that keeps the rule's main statement and all its numbers but leaves the condition out completely.`,
  ],
  [
    "unless",
    "unsupported",
    25,
    `Each source states a rule with an "unless" clause. The answer is one sentence (the claim) that keeps the rule's main statement and all its numbers but leaves the "unless" clause out completely.`,
  ],
  [
    "proviso",
    "unsupported",
    25,
    `Each source states a rule restricted by "provided (that)", "subject to" or "as long as" (vary them). The answer is one sentence (the claim) that keeps the main statement and all its numbers but leaves the proviso out completely.`,
  ],
  [
    "waiting-period",
    "unsupported",
    25,
    `Each source states an entitlement that applies only "after <number> <unit>" (for example "after 90 days of service", "after six months"). The answer is one sentence (the claim) that keeps the entitlement and its other numbers but leaves the waiting period out completely.`,
  ],
  [
    "eligibility-exception",
    "unsupported",
    25,
    `Each source restricts who a rule applies to, either "for <people> who/with ..." (for example "for employees with at least one year of service") or with "except ..." (for example "except contractors"). Use each form for about half the cases. The answer is one sentence (the claim) that keeps the rule and its numbers but leaves the restriction out completely.`,
  ],
  [
    "near-miss",
    "unsupported",
    25,
    `Each case has TWO sources. Source 1 states a rule with a restriction; vary the restriction: an approval with a coordinator inside it ("with manager and HR approval"), a bare "when" condition ("when the office is closed"), "only if", "unless", "subject to". Source 2 is an unrelated true statement that uses one content word of source 1's restriction (for example source 1 "... with manager approval", source 2 "Your manager sets the team schedule each week."). The answer has two sentences: first a sentence copied or lightly reworded from source 2, then the claim, which keeps source 1's main statement and numbers but leaves its restriction out completely.`,
  ],
  [
    "paraphrase-keeps-condition",
    "supported",
    25,
    `Each source states a rule with a restriction (an approval, "only if", "unless", "subject to", "after <number> <unit>" or "except"). The answer is one sentence (the claim): a faithful paraphrase of the whole source that keeps the restriction, reworded (for example "with manager approval" becomes "if a manager approves it" or "once their manager signs off").`,
  ],
  [
    "paraphrase-keeps-condition",
    "supported",
    25,
    `Each source states a rule with a restriction (an approval, "only if", "unless", "subject to", "after <number> <unit>" or "except"). The answer is one sentence (the claim) that restates the whole source in close wording, keeping the restriction in the same sentence.`,
  ],
  [
    "paraphrase-keeps-condition",
    "supported",
    25,
    `Each source states a rule with a restriction (an approval, "only if", "unless", "subject to", "after <number> <unit>" or "except"). The answer has two sentences: the first (the claim) states the rule's main statement without the restriction; the second restates the restriction using the source's own key words, so that both sentences are each supported by the source on their own (for example "Remote work is allowed two days per week. Remote work requires manager approval.").`,
  ],
  [
    "contrast-dropped",
    "supported",
    25,
    `Each source is one sentence of two clauses joined by "but not" or "but": a positive statement, then a contrasting statement about something else. The answer is one sentence (the claim): the first clause only, with the contrasting clause left out.`,
  ],
  [
    "contrast-dropped",
    "supported",
    25,
    `Each source is one sentence of two clauses joined by "whereas" or "while" (contrasting two different subjects). The answer is one sentence (the claim): one of the two clauses only, the other left out.`,
  ],
  [
    "contrast-dropped",
    "supported",
    25,
    `Each source is two clauses: a statement, then "however, ..." or "; however, ..." with a contrasting statement about something else. The answer is one sentence (the claim): the first statement only.`,
  ],
  [
    "non-restricting",
    "supported",
    25,
    `Each source contains an "if" or "except" that does NOT restrict the main statement: "even if ...", "if any", "if applicable", "whether or not ...", or "except as required by law" (use "except as required by law" in exactly 6 cases and add "subLabel": "except-as-required-by-law" to those; spread the others evenly). The answer is one sentence (the claim) that keeps the main statement and leaves that phrase out.`,
  ],
];

function parseCases(text) {
  const trimmed = String(text)
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, "");
  const arr = JSON.parse(trimmed);
  if (!Array.isArray(arr)) throw new Error("not an array");
  return arr;
}

function valid(c) {
  return (
    c &&
    Array.isArray(c.sources) &&
    c.sources.length >= 1 &&
    c.sources.every((s) => typeof s === "string" && s.trim()) &&
    typeof c.answer === "string" &&
    typeof c.claim === "string" &&
    c.claim.trim() &&
    c.answer.includes(c.claim.trim())
  );
}

const { mulberry32, shuffle } = require("./judge-datasets");

async function generate(cache) {
  const out = [];
  const usage = [];
  for (const [i, [stratum, label, count, instructions]] of BATCHES.entries()) {
    const body = {
      model: GENERATOR,
      max_tokens: 12000,
      // no temperature: claude-sonnet-5-5 rejects it (400 "deprecated for this model")
      messages: [
        {
          role: "user",
          content: `${COMMON}\n\nWrite exactly ${count} cases.\n${instructions}`,
        },
      ],
    };
    const r = await cache.messages(body);
    usage.push(r.data.usage);
    const text = (r.data.content || []).map((b) => b.text || "").join("");
    let items = [];
    try {
      items = parseCases(text);
    } catch (e) {
      console.error(
        `batch ${i} (${stratum}): unparseable reply (${e.message})`,
      );
    }
    const good = items.filter(valid).slice(0, count);
    console.log(
      `batch ${i} ${stratum}: ${items.length} returned, ${good.length} valid`,
    );
    good.forEach((c, k) =>
      out.push({
        id: `cd-${stratum}-${i}-${String(k + 1).padStart(2, "0")}`,
        stratum,
        controlType: label === "supported" ? stratum : null,
        group: label === "unsupported" ? stratum : null,
        subLabel: c.subLabel || null,
        domain: c.domain || null,
        expected: label,
        sources: c.sources.map((s) => s.trim()),
        answer: c.answer.trim(),
        claim: c.claim.trim(),
        generator: GENERATOR,
        review: "needs human review",
      }),
    );
  }
  // Seeded split within each stratum: first half dev, second half test
  const byStratum = new Map();
  for (const c of out) {
    if (!byStratum.has(c.stratum)) byStratum.set(c.stratum, []);
    byStratum.get(c.stratum).push(c);
  }
  for (const [stratum, list] of byStratum) {
    const shuffled = shuffle(
      list,
      mulberry32(
        SEED + [...stratum].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 0),
      ),
    );
    shuffled.forEach((c, k) => {
      c.split = k < Math.ceil(shuffled.length / 2) ? "dev" : "test";
    });
  }
  fs.writeFileSync(
    CASES_FILE,
    out.map((c) => JSON.stringify(c)).join("\n") + "\n",
  );
  console.log(
    `${out.length} cases -> ${path.relative(process.cwd(), CASES_FILE)}`,
  );
  return out;
}

function loadCases() {
  return fs
    .readFileSync(CASES_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function makeJudge(AnthropicConnector, cache, model, calls) {
  const judge = new AnthropicConnector({
    apiKey: cache.apiKey || "cached",
    model,
    maxTokens: 2000,
  });
  judge.client.defaults.adapter = cache.axiosAdapter((call) =>
    calls.push(call),
  );
  return judge;
}

async function verdicts(cases, lib, judgeFor) {
  return mapLimit(cases, 4, async (c) => {
    const check = await lib.checkAnswer({
      answer: c.answer,
      sources: c.sources.map((content, i) => ({ id: `s${i + 1}`, content })),
      evaluate: false,
      ...(judgeFor ? { judge: judgeFor() } : {}),
    });
    const targetFlagged = check.unsupported.includes(c.claim);
    const reason =
      check.judge &&
      (check.judge.verdicts.find((v) => v.sentence === c.claim) || {})
        .lexicalReason;
    return {
      id: c.id,
      flagged: targetFlagged,
      answerFlagged: !check.grounded,
      reason: reason || null,
    };
  });
}

function score(cases, results) {
  const byId = new Map(results.map((r) => [r.id, r]));
  const m = { tp: 0, fp: 0, fn: 0, tn: 0 };
  const perStratum = {};
  const perSub = {};
  for (const c of cases) {
    const r = byId.get(c.id);
    const pos = c.expected === "unsupported";
    if (pos && r.flagged) m.tp++;
    else if (pos) m.fn++;
    else if (r.flagged) m.fp++;
    else m.tn++;
    const s = (perStratum[c.stratum] ||= {
      n: 0,
      flagged: 0,
      expected: c.expected,
    });
    s.n++;
    if (r.flagged) s.flagged++;
    if (c.subLabel) {
      const t = (perSub[c.subLabel] ||= { n: 0, flagged: 0 });
      t.n++;
      if (r.flagged) t.flagged++;
    }
  }
  return { ...m, ...confusionMetrics(m), perStratum, perSubLabel: perSub };
}

async function run(cache) {
  const cases = loadCases();
  const after = {
    checkAnswer: require("../src/grounding/check-answer.js").checkAnswer,
    AnthropicConnector: require("../src/connectors/anthropic-connector.js")
      .AnthropicConnector,
  };
  const beforeDir = args.before && path.resolve(args.before);
  const before = beforeDir && {
    checkAnswer: require(path.join(beforeDir, "src/grounding/check-answer.js"))
      .checkAnswer,
    AnthropicConnector: require(
      path.join(beforeDir, "src/connectors/anthropic-connector.js"),
    ).AnthropicConnector,
  };
  const report = {
    generatedAt: new Date().toISOString(),
    environment: environment(),
    plan: "benchmarks/fixtures/condition-dropped-plan.md",
    seed: SEED,
    n: {
      all: cases.length,
      dev: cases.filter((c) => c.split === "dev").length,
      test: cases.filter((c) => c.split === "test").length,
    },
    runs: {},
    disagreements: [],
  };
  const versions = [["after", after], ...(before ? [["before", before]] : [])];
  const raw = {};
  for (const [version, lib] of versions) {
    raw[`lexical-${version}`] = await verdicts(cases, lib, null);
    for (const model of JUDGES) {
      const calls = [];
      raw[`${model}-${version}`] = await verdicts(cases, lib, () =>
        makeJudge(lib.AnthropicConnector, cache, model, calls),
      );
      report[`calls-${model}-${version}`] = {
        calls: calls.length,
        cached: calls.filter((c) => c.cached).length,
      };
    }
  }
  for (const [name, results] of Object.entries(raw)) {
    report.runs[name] = {
      test: score(
        cases.filter((c) => c.split === "test"),
        results,
      ),
      dev: score(
        cases.filter((c) => c.split === "dev"),
        results,
      ),
    };
  }
  if (raw["lexical-before"]) {
    const b = new Map(raw["lexical-before"].map((r) => [r.id, r]));
    for (const r of raw["lexical-after"]) {
      const was = b.get(r.id);
      if (was.flagged !== r.flagged) {
        const c = cases.find((x) => x.id === r.id);
        report.disagreements.push({
          id: r.id,
          split: c.split,
          stratum: c.stratum,
          expected: c.expected,
          before: was.flagged,
          after: r.flagged,
        });
      }
    }
  }
  report.results = raw;
  report.spend = cache.usageSummary ? cache.usageSummary() : null;
  const outFile = args.output;
  if (outFile)
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + "\n");
  for (const [name, r] of Object.entries(report.runs)) {
    const t = r.test;
    console.log(
      `${name.padEnd(28)} test P ${(t.precision ?? 0).toFixed(3)} R ${(t.recall ?? 0).toFixed(3)} F1 ${(t.f1 ?? 0).toFixed(3)}  (tp ${t.tp} fp ${t.fp} fn ${t.fn} tn ${t.tn})`,
    );
  }
  return report;
}

async function main() {
  const command = process.argv[2];
  const { apiKey } = liveAnthropic();
  const cache = new ClaudeCache({ apiKey, capUSD: Number(args.cap) });
  if (!Number.isFinite(Number(args.cap)))
    throw new Error("--cap=<usd> is required");
  if (command === "generate") await generate(cache);
  else if (command === "run") await run(cache);
  else throw new Error("usage: condition-dropped.js generate|run --cap=<usd>");
  console.log(
    `cache spend now US$${cache.spentUSD().toFixed(4)} (cap ${args.cap})`,
  );
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
