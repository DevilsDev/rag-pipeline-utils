#!/usr/bin/env node
/**
 * Groundedness benchmark: how well checkAnswer() finds answers with
 * unsupported content, lexically and with Claude as the judge, on RAGTruth
 * (benchmarks/judge-datasets.js).
 *
 * Each sampled answer is checked twice with the library as shipped
 * (`evaluate: false`):
 *   - lexical: checkAnswer({ answer, sources })
 *   - judge:   checkAnswer({ answer, sources, judge: new AnthropicConnector(...) })
 * An answer is flagged when checkAnswer finds any unsupported sentence
 * (`grounded: false`); it is labelled unsupported when RAGTruth's
 * annotators marked any hallucination span in it. Sentences are scored
 * too: a sentence is labelled unsupported when it overlaps a span.
 *
 * Neither the library nor the judge prompt was tuned on RAGTruth or any
 * other public set.
 *
 *   node benchmarks/judge.js [--model=claude-haiku-4-5-20251001] [--per-class=75]
 *     [--seed=20261105] [--concurrency=4] [--max-tokens=2000] [--lexical-only]
 *     [--cap=5] [--data-dir=dir] [--output=file.json]
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
} = require("./claude-common");

const MODEL = args.model || "claude-haiku-4-5-20251001";
const PER_CLASS = Number(args["per-class"] || 75);
const SEED = Number(args.seed || 20261105);
const CONCURRENCY = Number(args.concurrency || 4);
const MAX_TOKENS = Number(args["max-tokens"] || 2000);

/** Locate each checked sentence in the answer, in order. */
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

async function checkCase(c, cache) {
  const t0 = performance.now();
  const lexical = await checkAnswer({
    answer: c.answer,
    sources: c.sources,
    evaluate: false,
  });
  const lexicalMs = performance.now() - t0;
  const out = {
    id: c.id,
    task: c.task,
    hallucinated: c.hallucinated,
    lexical: { grounded: lexical.grounded, unsupported: lexical.unsupported },
    lexicalMs,
  };
  if (args["lexical-only"]) return out;

  const judge = new AnthropicConnector({
    apiKey: cache.apiKey || "cached",
    model: MODEL,
    maxTokens: MAX_TOKENS,
  });
  const calls = [];
  judge.client.defaults.adapter = cache.axiosAdapter((call) =>
    calls.push(call),
  );
  const t1 = performance.now();
  const judged = await checkAnswer({
    answer: c.answer,
    sources: c.sources,
    evaluate: false,
    judge,
  });
  const wallMs = performance.now() - t1;
  // Latency per check: local work plus the API call as it was measured
  // when made (a cache hit takes no time, so its recorded latency is added)
  const apiMs = calls.reduce((n, k) => n + k.latencyMs, 0);
  const localMs =
    wallMs -
    calls.filter((k) => !k.cached).reduce((n, k) => n + k.latencyMs, 0);
  out.judge = {
    grounded: judged.grounded,
    calls: judged.judge.calls,
    error: judged.judge.error || null,
    // checkAnswer's own judge.usage stays empty with AnthropicConnector,
    // whose generate() returns only the text; usage comes from the cache
    usageReported: Boolean(judged.judge.usage),
    usage: calls[0] ? calls[0].usage : null,
    stopReason: calls[0] ? calls[0].stopReason : null,
    latencyMs: localMs + apiMs,
    verdicts: judged.judge.verdicts.map((v) => ({
      sentence: v.sentence,
      verdict: v.verdict,
      lexicalReason: v.lexicalReason,
      decidedBy: v.decidedBy,
    })),
  };
  return out;
}

function responseMetrics(results, key) {
  const counts = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const r of results) {
    const flagged = !r[key].grounded;
    if (r.hallucinated) counts[flagged ? "tp" : "fn"] += 1;
    else counts[flagged ? "fp" : "tn"] += 1;
  }
  const unsupported = confusionMetrics(counts);
  const supported = confusionMetrics({
    tp: counts.tn,
    fp: counts.fn,
    fn: counts.fp,
    tn: counts.tp,
  });
  return {
    unsupported,
    supported: {
      precision: supported.precision,
      recall: supported.recall,
      f1: supported.f1,
      precisionInterval: supported.precisionInterval,
      recallInterval: supported.recallInterval,
    },
    flaggedShare: Number(((counts.tp + counts.fp) / results.length).toFixed(4)),
  };
}

function latency(values) {
  return {
    p50: Number(percentile(values, 50).toFixed(1)),
    p95: Number(percentile(values, 95).toFixed(1)),
  };
}

function sentenceAnalysis(results, sample) {
  const byId = new Map(sample.map((c) => [c.id, c]));
  const lexical = { tp: 0, fp: 0, fn: 0, tn: 0 };
  const judged = { tp: 0, fp: 0, fn: 0, tn: 0 };
  const reasons = {};
  let sentences = 0;
  let unlocated = 0;
  let mismatched = 0;
  for (const r of results) {
    const c = byId.get(r.id);
    const ranges = locate(
      c.answer,
      r.judge.verdicts.map((v) => v.sentence),
    );
    const lexicalSet = new Set(r.lexical.unsupported);
    r.judge.verdicts.forEach((v, i) => {
      sentences += 1;
      // The lexical run and the judge run's lexical reasons must agree
      if ((v.lexicalReason !== "supported") !== lexicalSet.has(v.sentence)) {
        mismatched += 1;
      }
      if (!ranges[i]) {
        unlocated += 1;
        return;
      }
      const gold = overlapsAny(ranges[i], c.spans);
      const lexFlag = lexicalSet.has(v.sentence);
      const judgeFlag = v.verdict !== "supported";
      lexical[gold ? (lexFlag ? "tp" : "fn") : lexFlag ? "fp" : "tn"] += 1;
      judged[gold ? (judgeFlag ? "tp" : "fn") : judgeFlag ? "fp" : "tn"] += 1;
      const reason = v.lexicalReason;
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
    judge: confusionMetrics(judged),
    byLexicalReason: reasons,
  };
}

async function main() {
  const { cases, source } = await loadRagTruth(args["data-dir"]);
  const sample = sampleRagTruth(cases, { perClass: PER_CLASS, seed: SEED });
  const { apiKey } = args["lexical-only"] ? { apiKey: null } : liveAnthropic();
  const cache = new ClaudeCache({
    apiKey,
    capUSD: Number(args.cap || 5),
  });
  console.log(
    `${source.dataset}: ${cases.length} cases, sample ${sample.length} (${PER_CLASS} per task and label, seed ${SEED})`,
  );

  let done = 0;
  const results = await mapLimit(sample, CONCURRENCY, async (c) => {
    try {
      return await checkCase(c, cache);
    } finally {
      done += 1;
      if (done % 25 === 0) {
        console.log(
          `${done}/${sample.length}  spent so far US$${cache.spentUSD().toFixed(4)}`,
        );
      }
    }
  });

  const configs = { lexical: "lexical" };
  if (!args["lexical-only"]) configs.judge = "judge";
  const tasks = ["all", "QA", "Summary", "Data2txt"];
  const metrics = {};
  for (const task of tasks) {
    const rows = results.filter((r) => task === "all" || r.task === task);
    metrics[task] = {
      cases: rows.length,
      labelledUnsupported: rows.filter((r) => r.hallucinated).length,
    };
    for (const key of Object.keys(configs)) {
      metrics[task][key] = responseMetrics(rows, key);
    }
  }

  const report = {
    benchmark: "judge",
    createdAt: new Date().toISOString(),
    environment: environment(),
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
    tuning:
      "Neither checkAnswer nor the judge prompt was tuned on RAGTruth or any other public set; the library ran as shipped.",
    settings: { evaluate: false },
    metrics,
  };

  report.latencyMs = {
    lexical: latency(results.map((r) => r.lexicalMs)),
  };
  if (!args["lexical-only"]) {
    const used = cache.usageSummary();
    const m = used[MODEL] || {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUSD: 0,
    };
    const calls = results.reduce((n, r) => n + r.judge.calls, 0);
    report.judge = {
      model: MODEL,
      maxTokens: MAX_TOKENS,
      temperature: 0,
      pricesPerMTok: PRICES[MODEL],
      pricesChecked: "2026-11-05",
      callDates: (() => {
        const dates = cache.used.map((e) => e.createdAt.slice(0, 10)).sort();
        return dates.length ? [dates[0], dates[dates.length - 1]] : null;
      })(),
      checksWithCall: results.filter((r) => r.judge.calls > 0).length,
      calls,
      errors: results.filter((r) => r.judge.error).length,
      errorKinds: results.reduce((acc, r) => {
        if (r.judge.error) acc[r.judge.error] = (acc[r.judge.error] || 0) + 1;
        return acc;
      }, {}),
      truncated: results.filter((r) => r.judge.stopReason === "max_tokens")
        .length,
      usageReportedByCheckAnswer: results.filter((r) => r.judge.usageReported)
        .length,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      costUSD: m.costUSD,
      costPer1000ChecksUSD: Number(
        ((m.costUSD / results.length) * 1000).toFixed(2),
      ),
    };
    report.latencyMs.judge = latency(results.map((r) => r.judge.latencyMs));
    report.latencyMs.judgeWithCall = latency(
      results.filter((r) => r.judge.calls > 0).map((r) => r.judge.latencyMs),
    );
    report.sentences = sentenceAnalysis(results, sample);
    report.cases = results.map((r) => ({
      id: r.id,
      task: r.task,
      hallucinated: r.hallucinated,
      lexicalFlagged: !r.lexical.grounded,
      judgeFlagged: !r.judge.grounded,
      judgeCalls: r.judge.calls,
      ...(r.judge.error && { judgeError: r.judge.error }),
    }));
  }

  for (const task of tasks) {
    for (const key of Object.keys(configs)) {
      const u = metrics[task][key].unsupported;
      console.log(
        `${task.padEnd(9)} ${key.padEnd(8)} P ${u.precision}  R ${u.recall}  F1 ${u.f1}  (TP ${u.tp} FP ${u.fp} FN ${u.fn} TN ${u.tn})`,
      );
    }
  }
  if (report.judge) {
    console.log(JSON.stringify(report.judge, null, 2));
    console.log(JSON.stringify(report.latencyMs));
  }

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
