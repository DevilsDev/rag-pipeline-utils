#!/usr/bin/env node
/**
 * Groundedness benchmark: how well checkAnswer() finds answers with
 * unsupported content, lexically and with Claude as the judge.
 *
 * Two suites, the same cases for every model:
 *   - RAGTruth (benchmarks/judge-datasets.js): a seeded, balanced sample of
 *     test answers. An answer is flagged when checkAnswer finds any
 *     unsupported sentence (`grounded: false`); it is labelled unsupported
 *     when RAGTruth's annotators marked a hallucination span in it.
 *     Sentences are scored too: a sentence is labelled unsupported when it
 *     overlaps a span.
 *   - Edge cases (benchmarks/fixtures/judge-edge-cases.jsonl): written for
 *     this project and committed before any model saw them, each with the
 *     expected verdict and a category.
 *
 * Each answer is checked with the library as shipped (`evaluate: false`):
 * lexically, checkAnswer({ answer, sources }), and with
 * checkAnswer({ answer, sources, judge: new AnthropicConnector({ apiKey, model, maxTokens }) }).
 *
 * One change is made to the connector's request, recorded per model in the
 * report: AnthropicConnector sends the judge's `temperature: 0`, which some
 * models reject with a 400 (see the report's `shippedJudge`). For those
 * models the benchmark removes `temperature` from the request body; the
 * rest of the request and the parsing of the reply are the library's own.
 *
 * Neither the library nor the judge prompt was tuned on RAGTruth, on any
 * other public set, or on the edge cases.
 *
 *   node benchmarks/judge.js [--models=a,b] [--per-class=75] [--seed=20261105]
 *     [--concurrency=4] [--max-tokens=2000] [--lexical-only] [--cap=90]
 *     [--data-dir=dir] [--output=file.json]
 *
 * The key comes from ANTHROPIC_API_KEY or ~/.config/rag-pipeline-utils/live-test.env
 * (see __tests__/live/live-env.js). Responses are cached in
 * benchmarks/.data/claude-cache/, so a rerun costs nothing.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");

const { checkAnswer } = require("../src/grounding/check-answer.js");
const {
  AnthropicConnector,
} = require("../src/connectors/anthropic-connector.js");
const { liveAnthropic } = require("../__tests__/live/live-env.js");
const { loadRagTruth, sampleRagTruth } = require("./judge-datasets");
const { ClaudeCache, PRICES } = require("./claude-cache");
const {
  args,
  environment,
  confusionMetrics,
  percentile,
  mapLimit,
  buildLong,
  ratio,
  wilson,
} = require("./claude-common");

const DEFAULT_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-haiku-5-5",
  "claude-sonnet-5-5",
  "claude-opus-5-5",
  "claude-fable-5-1",
];
const MODELS = args.models ? args.models.split(",") : DEFAULT_MODELS;
const PER_CLASS = Number(args["per-class"] || 75);
const SEED = Number(args.seed || 20261105);
const CONCURRENCY = Number(args.concurrency || 4);
const MAX_TOKENS = Number(args["max-tokens"] || 2000);
const EDGE_FILE = path.join(__dirname, "fixtures", "judge-edge-cases.jsonl");

const round1 = (x) => Number(x.toFixed(1));
const latency = (values) => ({
  p50: round1(percentile(values, 50)),
  p95: round1(percentile(values, 95)),
});

/** A judge that never answers: checkAnswer keeps its lexical verdicts and reports why. */
const SILENT_JUDGE = { generate: async () => "[]" };

function makeJudge(cache, model, adapterOptions, calls) {
  const judge = new AnthropicConnector({
    apiKey: cache.apiKey || "cached",
    model,
    maxTokens: MAX_TOKENS,
  });
  judge.client.defaults.adapter = cache.axiosAdapter(
    (call) => calls.push(call),
    adapterOptions,
  );
  return judge;
}

/**
 * Does the shipped judge work on this model? One small check through the
 * connector as shipped; a 400 about temperature means the benchmark must
 * remove it.
 */
async function shippedJudge(cache, model) {
  const calls = [];
  try {
    await checkAnswer({
      answer: "Staff get five weeks off annually.",
      sources: [
        {
          id: "leave",
          content: "Each worker may take five weeks of paid leave every year.",
        },
      ],
      evaluate: false,
      judge: makeJudge(cache, model, {}, calls),
    });
    return { works: true, omitTemperature: false };
  } catch (error) {
    const status = error.response && error.response.status;
    if (status === 400 && /temperature/i.test(error.message)) {
      return { works: false, error: error.message, omitTemperature: true };
    }
    throw error;
  }
}

async function judged(c, cache, model, adapterOptions) {
  const calls = [];
  const t0 = performance.now();
  const check = await checkAnswer({
    answer: c.answer,
    sources: c.sources,
    evaluate: false,
    judge: makeJudge(cache, model, adapterOptions, calls),
  });
  const wallMs = performance.now() - t0;
  // Latency per check: local work plus the API call as it was measured
  // when made (a cache hit takes no time, so its recorded latency is added)
  const apiMs = calls.reduce((n, k) => n + k.latencyMs, 0);
  const newMs = calls
    .filter((k) => !k.cached)
    .reduce((n, k) => n + k.latencyMs, 0);
  return {
    grounded: check.grounded,
    calls: check.judge.calls,
    error: check.judge.error || null,
    usageReported: Boolean(check.judge.usage),
    usage: calls[0] ? calls[0].usage : null,
    stopReason: calls[0] ? calls[0].stopReason : null,
    firstBlock: calls[0] ? calls[0].firstBlock : null,
    latencyMs: wallMs - newMs + apiMs,
    verdicts: check.judge.verdicts.map((v) => ({
      sentence: v.sentence,
      verdict: v.verdict,
      lexicalReason: v.lexicalReason,
      decidedBy: v.decidedBy,
      reason: v.reason,
    })),
  };
}

// --- RAGTruth --------------------------------------------------------------

function locate(answer, sentences) {
  let cursor = 0;
  return sentences.map((text) => {
    let at = answer.indexOf(text, cursor);
    if (at === -1) at = answer.indexOf(text);
    if (at === -1) return null;
    cursor = at + text.length;
    return { start: at, end: at + text.length };
  });
}

const overlapsAny = (range, spans) =>
  spans.some((s) => range.start < s.end && s.start < range.end);

function responseMetrics(rows, flagged) {
  const counts = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const r of rows) {
    const f = flagged(r);
    if (r.hallucinated) counts[f ? "tp" : "fn"] += 1;
    else counts[f ? "fp" : "tn"] += 1;
  }
  const supported = confusionMetrics({
    tp: counts.tn,
    fp: counts.fn,
    fn: counts.fp,
    tn: counts.tp,
  });
  return {
    unsupported: confusionMetrics(counts),
    supported: {
      precision: supported.precision,
      recall: supported.recall,
      f1: supported.f1,
      precisionInterval: supported.precisionInterval,
      recallInterval: supported.recallInterval,
    },
    flaggedShare: ratio(counts.tp + counts.fp, rows.length),
  };
}

const TASKS = ["all", "QA", "Summary", "Data2txt"];

function byTask(rows, flagged) {
  return Object.fromEntries(
    TASKS.map((task) => {
      const sub = rows.filter((r) => task === "all" || r.task === task);
      return [task, { cases: sub.length, ...responseMetrics(sub, flagged) }];
    }),
  );
}

/** Sentence-level scores, lexical and judged, and counts by lexical reason. */
function sentenceAnalysis(rows, sample, model) {
  const byId = new Map(sample.map((c) => [c.id, c]));
  const lexical = { tp: 0, fp: 0, fn: 0, tn: 0 };
  const judgedCounts = { tp: 0, fp: 0, fn: 0, tn: 0 };
  const reasons = {};
  let sentences = 0;
  let unlocated = 0;
  let mismatched = 0;
  for (const r of rows) {
    const c = byId.get(r.id);
    const verdicts = r.judge[model].verdicts;
    const ranges = locate(
      c.answer,
      verdicts.map((v) => v.sentence),
    );
    const lexicalSet = new Set(r.lexical.unsupported);
    verdicts.forEach((v, i) => {
      sentences += 1;
      // The lexical run and the judge run's lexical reasons must agree
      if (
        (r.lexicalReasons[i] !== "supported") !==
        lexicalSet.has(v.sentence)
      ) {
        mismatched += 1;
      }
      if (!ranges[i]) {
        unlocated += 1;
        return;
      }
      const gold = overlapsAny(ranges[i], c.spans);
      const lexFlag = lexicalSet.has(v.sentence);
      const judgeFlag = v.verdict !== "supported";
      const cell = (flag) => (gold ? (flag ? "tp" : "fn") : flag ? "fp" : "tn");
      lexical[cell(lexFlag)] += 1;
      judgedCounts[cell(judgeFlag)] += 1;
      // Why the lexical check failed it, with no model involved
      const reason = r.lexicalReasons[i];
      const row = (reasons[reason] = reasons[reason] || {
        sentences: 0,
        labelledUnsupported: 0,
        judgeSupported: 0,
        judgeSupportedButLabelledUnsupported: 0,
      });
      row.sentences += 1;
      if (gold) row.labelledUnsupported += 1;
      if (v.decidedBy === "judge" && v.verdict === "supported") {
        row.judgeSupported += 1;
        if (gold) row.judgeSupportedButLabelledUnsupported += 1;
      }
    });
  }
  return {
    sentences,
    unlocated,
    lexicalMismatches: mismatched,
    lexical: confusionMetrics(lexical),
    judge: confusionMetrics(judgedCounts),
    byLexicalReason: reasons,
  };
}

// --- Edge cases ------------------------------------------------------------

function loadEdgeCases() {
  const text = fs.readFileSync(EDGE_FILE, "utf8");
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
    .map((c) => ({
      ...c,
      sources: c.sources.map((s) =>
        s.long ? { id: s.id, content: buildLong(s.long) } : s,
      ),
    }));
}

const verdictOf = (check) => (check.grounded ? "supported" : "unsupported");

function scoreEdge(cases, results) {
  const categories = {};
  const failures = [];
  let sentenceTotal = 0;
  let sentenceRight = 0;
  let sentenceSkipped = 0;
  cases.forEach((c, i) => {
    const r = results[i];
    const cat = (categories[c.category] = categories[c.category] || {
      cases: 0,
      correct: 0,
      falseAlarms: 0,
      misses: 0,
      judgeRuled: 0,
    });
    cat.cases += 1;
    if (r.verdicts.some((v) => v.decidedBy === "judge")) cat.judgeRuled += 1;
    if (r.verdict === c.expected) cat.correct += 1;
    else {
      const kind = c.expected === "supported" ? "false_alarm" : "miss";
      cat[kind === "false_alarm" ? "falseAlarms" : "misses"] += 1;
      failures.push({
        id: c.id,
        category: c.category,
        expected: c.expected,
        got: r.verdict,
        kind,
        answer: c.answer,
        sentences: r.verdicts,
      });
    }
    if (c.expectedSentences) {
      if (r.verdicts.length !== c.expectedSentences.length) {
        sentenceSkipped += 1;
      } else {
        c.expectedSentences.forEach((e, k) => {
          sentenceTotal += 1;
          if (r.verdicts[k].verdict === e) sentenceRight += 1;
        });
      }
    }
  });
  const correct = Object.values(categories).reduce((n, c) => n + c.correct, 0);
  return {
    correct,
    cases: cases.length,
    accuracy: ratio(correct, cases.length),
    accuracyInterval: wilson(correct, cases.length),
    falseAlarms: failures.filter((f) => f.kind === "false_alarm").length,
    misses: failures.filter((f) => f.kind === "miss").length,
    sentences: {
      scored: sentenceTotal,
      correct: sentenceRight,
      casesWithOtherSplit: sentenceSkipped,
    },
    categories,
    failures,
  };
}

// --- Main ------------------------------------------------------------------

async function main() {
  const { cases, source } = await loadRagTruth(args["data-dir"]);
  const sample = sampleRagTruth(cases, { perClass: PER_CLASS, seed: SEED });
  const edge = loadEdgeCases();
  const lexicalOnly = Boolean(args["lexical-only"]);
  const { apiKey } = lexicalOnly ? { apiKey: null } : liveAnthropic();
  const cache = new ClaudeCache({ apiKey, capUSD: Number(args.cap || 90) });
  console.log(
    `${source.dataset}: ${cases.length} cases, sample ${sample.length} (${PER_CLASS} per task and label, seed ${SEED}); ${edge.length} edge cases`,
  );

  // Lexical, once: it doesn't depend on the model
  const rows = [];
  for (const c of sample) {
    const t0 = performance.now();
    const check = await checkAnswer({
      answer: c.answer,
      sources: c.sources,
      evaluate: false,
    });
    rows.push({
      id: c.id,
      task: c.task,
      hallucinated: c.hallucinated,
      lexical: { grounded: check.grounded, unsupported: check.unsupported },
      lexicalMs: performance.now() - t0,
      // Why each sentence failed, with no model involved
      lexicalReasons: (
        await checkAnswer({
          answer: c.answer,
          sources: c.sources,
          evaluate: false,
          judge: SILENT_JUDGE,
        })
      ).judge.verdicts.map((v) => v.lexicalReason),
      judge: {},
    });
  }
  const edgeLexical = [];
  for (const c of edge) {
    const check = await checkAnswer({
      answer: c.answer,
      sources: c.sources,
      evaluate: false,
      judge: SILENT_JUDGE, // the lexical verdicts, with their reasons
    });
    edgeLexical.push({
      verdict: verdictOf(check),
      verdicts: check.judge.verdicts.map((v) => ({
        sentence: v.sentence,
        verdict: v.verdict,
        lexicalReason: v.lexicalReason,
      })),
    });
  }

  const report = {
    benchmark: "judge",
    createdAt: new Date().toISOString(),
    environment: environment(),
    tuning:
      "Neither checkAnswer nor the judge prompt was tuned on RAGTruth, on any other public set, or on the edge cases; the library ran as shipped.",
    settings: { evaluate: false, judgeMaxTokens: MAX_TOKENS },
    ragtruth: {
      dataset: {
        ...source,
        cases: cases.length,
        sample: {
          size: sample.length,
          perTaskAndLabel: PER_CLASS,
          seed: SEED,
          rule: "For each task, an equal number of answers with and without annotated hallucinations, drawn with a seeded shuffle from the answers annotated as good quality (25 refusals or truncated answers excluded).",
        },
      },
      lexical: {
        metrics: byTask(rows, (r) => !r.lexical.grounded),
        latencyMs: latency(rows.map((r) => r.lexicalMs)),
      },
      models: {},
    },
    edge: {
      file: "benchmarks/fixtures/judge-edge-cases.jsonl",
      cases: edge.length,
      lexical: scoreEdge(edge, edgeLexical),
      models: {},
    },
    models: {},
  };

  for (const model of lexicalOnly ? [] : MODELS) {
    const start = cache.used.length;
    const shipped = await shippedJudge(cache, model);
    const omit = shipped.omitTemperature;
    console.log(
      `${model}: shipped judge ${shipped.works ? "works" : `fails (${shipped.error})`}`,
    );

    // As shipped (with temperature removed where the model needs it):
    // the connector reads content[0].text
    const shippedOptions = { omitTemperature: omit };
    const shippedRag = await mapLimit(rows, CONCURRENCY, (row, i) =>
      judged(sample[i], cache, model, shippedOptions),
    );
    const shippedEdge = await mapLimit(edge, CONCURRENCY, async (c) => {
      const r = await judged(c, cache, model, shippedOptions);
      return {
        verdict: r.grounded ? "supported" : "unsupported",
        verdicts: r.verdicts,
      };
    });
    const shippedScore = scoreEdge(edge, shippedEdge);
    const asShipped = {
      noTextReplies: shippedRag.filter(
        (r) => r.error === "judge returned no text",
      ).length,
      calls: shippedRag.reduce((n, r) => n + r.calls, 0),
      metrics: responseMetrics(
        rows.map((r, i) => ({ ...r, flagged: !shippedRag[i].grounded })),
        (r) => r.flagged,
      ),
      edge: {
        correct: shippedScore.correct,
        cases: shippedScore.cases,
        falseAlarms: shippedScore.falseAlarms,
        misses: shippedScore.misses,
      },
    };

    // Measured: the same replies with the text block first
    const options = { omitTemperature: omit, textFirst: true };
    let done = 0;
    const ragStart = cache.used.length;
    await mapLimit(rows, CONCURRENCY, async (row, i) => {
      row.judge[model] = await judged(sample[i], cache, model, options);
      done += 1;
      if (done % 50 === 0) {
        console.log(
          `  ${model} ${done}/${rows.length}  total spend US$${cache.spentUSD().toFixed(4)}`,
        );
      }
    });
    const ragEntries = cache.used.slice(ragStart);
    const edgeStart = cache.used.length;
    const edgeResults = await mapLimit(edge, CONCURRENCY, async (c) => {
      const r = await judged(c, cache, model, options);
      return {
        verdict: r.grounded ? "supported" : "unsupported",
        verdicts: r.verdicts,
        calls: r.calls,
        error: r.error,
      };
    });
    const edgeEntries = cache.used.slice(edgeStart);
    // Each response once: the as-shipped and measured passes share them
    const seen = new Set();
    const allEntries = cache.used.slice(start).filter((e) => {
      if (seen.has(e.key)) return false;
      seen.add(e.key);
      return true;
    });

    const usage = (entries) => {
      const u = { calls: entries.length, inputTokens: 0, outputTokens: 0 };
      for (const e of entries) {
        u.inputTokens += e.response.usage.input_tokens || 0;
        u.outputTokens += e.response.usage.output_tokens || 0;
      }
      return u;
    };
    const cost = (entries) =>
      Number(
        cache
          .usageSummary((e) => entries.includes(e))
          [model]?.costUSD.toFixed(4) ?? 0,
      );
    const results = rows.map((r) => r.judge[model]);
    const ragUsage = usage(ragEntries);
    const ragCost = cost(ragEntries);
    const errors = {};
    for (const r of results) {
      if (r.error) errors[r.error] = (errors[r.error] || 0) + 1;
    }

    report.models[model] = {
      pricesPerMTok: PRICES[model],
      pricesChecked: "2026-11-05",
      shippedJudge: shipped,
      requestChange: omit
        ? "temperature removed from the connector's request body"
        : null,
      responseChange:
        "text blocks moved before other blocks in the reply the connector parses",
      asShipped,
      callDates: (() => {
        const dates = allEntries.map((e) => e.createdAt.slice(0, 10)).sort();
        return dates.length ? [dates[0], dates[dates.length - 1]] : null;
      })(),
      totalCalls: allEntries.length,
      totalCostUSD: cost(allEntries),
    };
    report.ragtruth.models[model] = {
      metrics: byTask(rows, (r) => !r.judge[model].grounded),
      checksWithCall: results.filter((r) => r.calls > 0).length,
      calls: results.reduce((n, r) => n + r.calls, 0),
      errors: Object.values(errors).reduce((a, b) => a + b, 0),
      errorKinds: errors,
      truncated: results.filter((r) => r.stopReason === "max_tokens").length,
      firstBlockNotText: results.filter(
        (r) => r.firstBlock && r.firstBlock !== "text",
      ).length,
      usageReportedByCheckAnswer: results.filter((r) => r.usageReported).length,
      ...ragUsage,
      costUSD: ragCost,
      costPer1000ChecksUSD: Number(((ragCost / rows.length) * 1000).toFixed(2)),
      latencyMs: latency(results.map((r) => r.latencyMs)),
      latencyMsWithCall: latency(
        results.filter((r) => r.calls > 0).map((r) => r.latencyMs),
      ),
      sentences: sentenceAnalysis(rows, sample, model),
    };
    report.edge.models[model] = {
      ...scoreEdge(edge, edgeResults),
      calls: edgeResults.reduce((n, r) => n + r.calls, 0),
      errors: edgeResults.filter((r) => r.error).length,
      ...usage(edgeEntries),
      costUSD: cost(edgeEntries),
    };

    const m = report.ragtruth.models[model].metrics.all.unsupported;
    const e = report.edge.models[model];
    console.log(
      `  RAGTruth P ${m.precision} R ${m.recall} F1 ${m.f1} (TP ${m.tp} FP ${m.fp} FN ${m.fn} TN ${m.tn}); edge ${e.correct}/${e.cases}; US$${report.models[model].totalCostUSD}; total spend US$${cache.spentUSD().toFixed(4)}`,
    );
  }

  // The clean answers the lexical check flags: could a judge clear them?
  // Only low_overlap sentences go to the judge, so an answer with any
  // number or negation mismatch stays flagged whatever the judge says.
  {
    const flaggedClean = rows.filter(
      (r) => !r.hallucinated && !r.lexical.grounded,
    );
    const reasonsOf = (r) =>
      new Set(r.lexicalReasons.filter((x) => x !== "supported"));
    report.ragtruth.lexicalFalseAlarms = {
      answers: flaggedClean.length,
      onlyLowOverlap: flaggedClean.filter((r) => {
        const s = reasonsOf(r);
        return s.size === 1 && s.has("low_overlap");
      }).length,
      withNumberMismatch: flaggedClean.filter((r) =>
        reasonsOf(r).has("number_mismatch"),
      ).length,
      withPolarityMismatch: flaggedClean.filter((r) =>
        reasonsOf(r).has("polarity_mismatch"),
      ).length,
    };
  }

  report.ragtruth.cases = rows.map((r) => ({
    id: r.id,
    task: r.task,
    hallucinated: r.hallucinated,
    lexicalFlagged: !r.lexical.grounded,
    judgeFlagged: Object.fromEntries(
      Object.entries(r.judge).map(([m, j]) => [m, !j.grounded]),
    ),
  }));

  const l = report.ragtruth.lexical.metrics.all.unsupported;
  console.log(
    `lexical  RAGTruth P ${l.precision} R ${l.recall} F1 ${l.f1} (TP ${l.tp} FP ${l.fp} FN ${l.fn} TN ${l.tn}); edge ${report.edge.lexical.correct}/${report.edge.lexical.cases}`,
  );

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
