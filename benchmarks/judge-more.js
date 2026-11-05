#!/usr/bin/env node
/**
 * Groundedness benchmark, second round (benchmarks/fixtures/claude-bench-plan.md):
 *
 *   1. The full RAGTruth test split (every good-quality answer), lexical and
 *      with Claude Haiku 4.5, Haiku 5.5 and Sonnet 5.5 as the judge.
 *   2. Run-to-run variance: Haiku 5.5 and Sonnet 5.5, three runs on a fixed
 *      300-answer subset; runs 2 and 3 carry a run tag in the cache key, so
 *      the cache can't answer them.
 *   3. HaluEval qa: 500 seeded, balanced cases, lexical and with the same
 *      three judges.
 *
 * The library runs as shipped (checkAnswer with AnthropicConnector as the
 * judge, evaluate: false). Same caching, pricing and spend cap as
 * benchmarks/judge.js.
 *
 *   node benchmarks/judge-more.js [--concurrency=6] [--cap=88] [--output=file.json]
 *     [--only=full,variance,halueval]
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");

const { checkAnswer } = require("../src/grounding/check-answer.js");
const { liveAnthropic } = require("../__tests__/live/live-env.js");
const {
  loadRagTruth,
  sampleRagTruth,
  loadHaluEvalQA,
  sampleHaluEval,
  mulberry32,
  shuffle,
} = require("./judge-datasets");
const { ClaudeCache, PRICES } = require("./claude-cache");
const { args, environment, mapLimit, ratio } = require("./claude-common");
const {
  judged,
  responseMetrics,
  byTask,
  latency,
  temperatureDropped,
} = require("./judge");

const CONCURRENCY = Number(args.concurrency || 6);
const ONLY = new Set(
  (args.only || "full,variance,halueval").split(",").filter(Boolean),
);
const FULL_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-haiku-5-5",
  "claude-sonnet-5-5",
];
const VARIANCE_MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5"];
const VARIANCE_SEED = 20261106;
const RUNS = [undefined, "run2", "run3"]; // run 1 is the cached first run

async function lexical(cases) {
  const out = [];
  for (const c of cases) {
    const t0 = performance.now();
    const check = await checkAnswer({
      answer: c.answer,
      sources: c.sources,
      question: c.question,
      evaluate: false,
    });
    out.push({
      id: c.id,
      task: c.task,
      hallucinated: c.hallucinated,
      grounded: check.grounded,
      ms: performance.now() - t0,
    });
  }
  return out;
}

/** Judge every case with one model; entries are the cache entries used. */
async function judgeAll(cache, model, cases, tag, label) {
  const start = cache.used.length;
  let done = 0;
  const results = await mapLimit(cases, CONCURRENCY, async (c) => {
    const r = await judged(
      { answer: c.answer, sources: c.sources },
      cache,
      model,
      tag,
    );
    done += 1;
    if (done % 250 === 0) {
      console.log(
        `  ${label} ${model}${tag ? ` ${tag}` : ""} ${done}/${cases.length}  total spend US$${cache.spentUSD().toFixed(2)}`,
      );
    }
    return {
      id: c.id,
      task: c.task,
      hallucinated: c.hallucinated,
      grounded: r.grounded,
      calls: r.calls,
      error: r.error,
      latencyMs: r.latencyMs,
      verdicts: r.verdicts.map((v) => v.verdict),
    };
  });
  return { results, entries: cache.used.slice(start) };
}

function costOf(cache, model, entries) {
  const s = cache.usageSummary((e) => entries.includes(e))[model];
  return s ? s.costUSD : 0;
}

function usageOf(entries) {
  const u = { calls: entries.length, inputTokens: 0, outputTokens: 0 };
  for (const e of entries) {
    u.inputTokens += e.response.usage.input_tokens || 0;
    u.outputTokens += e.response.usage.output_tokens || 0;
  }
  return u;
}

function modelSummary(cache, model, results, entries) {
  const cost = costOf(cache, model, entries);
  return {
    calls: results.reduce((n, r) => n + r.calls, 0),
    errors: results.filter((r) => r.error).length,
    ...usageOf(entries),
    costUSD: cost,
    costPer1000ChecksUSD: Number(((cost / results.length) * 1000).toFixed(2)),
    latencyMs: latency(results.map((r) => r.latencyMs)),
  };
}

/** Seeded 300-answer subset of the 450 sample: 50 per task and label. */
function varianceSubset(sample) {
  const random = mulberry32(VARIANCE_SEED);
  const out = [];
  for (const task of ["QA", "Summary", "Data2txt"]) {
    for (const hallucinated of [true, false]) {
      const pool = sample.filter(
        (c) => c.task === task && c.hallucinated === hallucinated,
      );
      out.push(...shuffle(pool, random).slice(0, 50));
    }
  }
  return out;
}

function flips(runs) {
  const n = runs[0].length;
  let answers = 0;
  let sentences = 0;
  let sentenceTotal = 0;
  const pairs = [];
  for (let a = 0; a < runs.length; a++) {
    for (let b = a + 1; b < runs.length; b++) {
      let k = 0;
      for (let i = 0; i < n; i++) {
        if (runs[a][i].grounded !== runs[b][i].grounded) k += 1;
      }
      pairs.push({ runs: [a + 1, b + 1], answersChanged: k });
    }
  }
  for (let i = 0; i < n; i++) {
    if (new Set(runs.map((r) => r[i].grounded)).size > 1) answers += 1;
    const len = Math.min(...runs.map((r) => r[i].verdicts.length));
    for (let k = 0; k < len; k++) {
      sentenceTotal += 1;
      if (new Set(runs.map((r) => r[i].verdicts[k])).size > 1) sentences += 1;
    }
  }
  return {
    answers: n,
    answersNotUnanimous: answers,
    answersNotUnanimousShare: ratio(answers, n),
    pairs,
    sentences: sentenceTotal,
    sentencesNotUnanimous: sentences,
    sentencesNotUnanimousShare: ratio(sentences, sentenceTotal),
  };
}

async function main() {
  const { cases, source } = await loadRagTruth(args["data-dir"]);
  const { apiKey } = liveAnthropic();
  const cache = new ClaudeCache({ apiKey, capUSD: Number(args.cap || 88) });
  const report = {
    benchmark: "judge-more",
    createdAt: new Date().toISOString(),
    environment: environment(),
    plan: "benchmarks/fixtures/claude-bench-plan.md",
    tuning:
      "Neither checkAnswer nor the judge prompt was tuned on these cases; the library ran as shipped.",
    models: {},
  };
  const track = (model, entries) => {
    const m = (report.models[model] = report.models[model] || {
      pricesPerMTok: PRICES[model],
      calls: 0,
      costUSD: 0,
    });
    m.calls += entries.length;
    m.costUSD = Number((m.costUSD + costOf(cache, model, entries)).toFixed(4));
  };

  // 1. Full split
  if (ONLY.has("full")) {
    const full = cases
      .filter((c) => c.quality === "good")
      .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
    console.log(`RAGTruth full: ${full.length} good-quality test answers`);
    const lex = await lexical(full);
    report.ragtruthFull = {
      dataset: {
        ...source,
        cases: full.length,
        labelledUnsupported: full.filter((c) => c.hallucinated).length,
        rule: "Every test answer annotated as good quality (25 refusals or truncated answers excluded).",
        byTask: Object.fromEntries(
          ["QA", "Summary", "Data2txt"].map((t) => [
            t,
            {
              cases: full.filter((c) => c.task === t).length,
              labelledUnsupported: full.filter(
                (c) => c.task === t && c.hallucinated,
              ).length,
            },
          ]),
        ),
      },
      lexical: {
        metrics: byTask(lex, (r) => !r.grounded),
        latencyMs: latency(lex.map((r) => r.ms)),
      },
      models: {},
    };
    for (const model of FULL_MODELS) {
      const { results, entries } = await judgeAll(
        cache,
        model,
        full,
        undefined,
        "full",
      );
      track(model, entries);
      report.ragtruthFull.models[model] = {
        metrics: byTask(results, (r) => !r.grounded),
        ...modelSummary(cache, model, results, entries),
      };
      const u = report.ragtruthFull.models[model].metrics.all.unsupported;
      console.log(
        `  ${model}: P ${u.precision} R ${u.recall} F1 ${u.f1} (${u.tp}/${u.fp}/${u.fn}/${u.tn}); total spend US$${cache.spentUSD().toFixed(2)}`,
      );
    }
  }

  // 2. Variance
  if (ONLY.has("variance")) {
    const subset = varianceSubset(sampleRagTruth(cases));
    report.variance = {
      subset: {
        size: subset.length,
        seed: VARIANCE_SEED,
        rule: "From the 450-answer sample, 50 answers per task and label, from a seeded shuffle of each group.",
      },
      models: {},
    };
    for (const model of VARIANCE_MODELS) {
      const runs = [];
      for (const tag of RUNS) {
        const { results, entries } = await judgeAll(
          cache,
          model,
          subset,
          tag,
          "variance",
        );
        track(model, entries);
        runs.push(results);
      }
      const metrics = runs.map(
        (r) => responseMetrics(r, (x) => !x.grounded).unsupported,
      );
      const f1s = metrics.map((m) => m.f1);
      report.variance.models[model] = {
        runs: metrics.map((m, i) => ({
          run: i + 1,
          cached: i === 0,
          precision: m.precision,
          recall: m.recall,
          f1: m.f1,
          tp: m.tp,
          fp: m.fp,
          fn: m.fn,
          tn: m.tn,
        })),
        f1: {
          min: Math.min(...f1s),
          max: Math.max(...f1s),
          mean: Number(
            (f1s.reduce((a, b) => a + b, 0) / f1s.length).toFixed(4),
          ),
        },
        flips: flips(runs),
      };
      console.log(
        `  variance ${model}: F1 ${f1s.join(" / ")}; answers not unanimous ${report.variance.models[model].flips.answersNotUnanimous}`,
      );
    }
  }

  // 3. HaluEval
  if (ONLY.has("halueval")) {
    const { source: hsource, rows } = await loadHaluEvalQA(args["data-dir"]);
    const halu = sampleHaluEval(rows);
    const lex = await lexical(halu);
    report.halueval = {
      dataset: {
        ...hsource,
        rows: rows.length,
        cases: halu.length,
        seed: 20261107,
        rule: "A seeded shuffle of the rows: the first 250 give their right answer (supported), the next 250 their hallucinated answer (unsupported). Source: the row's knowledge.",
      },
      lexical: { metrics: responseMetrics(lex, (r) => !r.grounded) },
      models: {},
    };
    for (const model of FULL_MODELS) {
      const { results, entries } = await judgeAll(
        cache,
        model,
        halu,
        undefined,
        "halueval",
      );
      track(model, entries);
      report.halueval.models[model] = {
        metrics: responseMetrics(results, (r) => !r.grounded),
        ...modelSummary(cache, model, results, entries),
      };
      const u = report.halueval.models[model].metrics.unsupported;
      console.log(
        `  halueval ${model}: P ${u.precision} R ${u.recall} F1 ${u.f1} (${u.tp}/${u.fp}/${u.fn}/${u.tn}); total spend US$${cache.spentUSD().toFixed(2)}`,
      );
    }
  }

  for (const [model, m] of Object.entries(report.models)) {
    m.temperatureDropped = temperatureDropped.has(model);
    const dates = cache.used
      .filter((e) => e.model === model)
      .map((e) => e.createdAt.slice(0, 10))
      .sort();
    m.callDates = dates.length ? [dates[0], dates[dates.length - 1]] : null;
  }
  console.log(`Total spend US$${cache.spentUSD().toFixed(2)}`);
  if (args.output) {
    fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
    fs.writeFileSync(args.output, JSON.stringify(report, null, 2) + "\n");
    console.log(`Report written to ${args.output}`);
  }
}

main().catch((error) => {
  // Never print an error object: an HTTP client error can carry the API key
  console.error(error && error.message ? error.message : "failed");
  process.exit(1);
});
