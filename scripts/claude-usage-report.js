#!/usr/bin/env node
/**
 * A content-free record of every Claude API call this project's testing
 * made: the benchmarks (their response cache), the consumer journeys and
 * the live test suite (their usage ledgers). Writes
 * benchmarks/results/claude-usage.json, which benchmarks/render.js turns
 * into tables on the Benchmarks page.
 *
 * Only metadata is read and written: model, date, HTTP status, stop
 * reason, token counts and latency. No prompt, answer or key.
 *
 *   node scripts/claude-usage-report.js [--cache=dir] [--ledgers=dir]
 *     [--output=file.json]
 *
 * Sources, by default:
 *   benchmarks/.data/claude-cache/                 (benchmarks)
 *   ~/.config/rag-pipeline-utils/consumer-ledger.jsonl  (consumer journeys)
 *   ~/.config/rag-pipeline-utils/live-ledger.jsonl      (npm run test:live)
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v = "true"] = a.slice(2).split("=");
      return [k, v];
    }),
);

const ROOT = path.join(__dirname, "..");
const CACHE =
  args.cache || path.join(ROOT, "benchmarks", ".data", "claude-cache");
const LEDGERS =
  args.ledgers || path.join(os.homedir(), ".config", "rag-pipeline-utils");
const OUTPUT =
  args.output || path.join(ROOT, "benchmarks", "results", "claude-usage.json");

/**
 * US$ per million tokens, standard tier, from
 * https://platform.claude.com/docs/en/about-claude/pricing (2026-11-05).
 * Cache writes cost 1.25x (5 minutes) or 2x (1 hour) the input price.
 */
const PRICES = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
};
const PRICES_AS_OF = "2026-11-05";

/** The model's family name, so dated ids share a row. */
function family(model) {
  const m = String(model || "unknown");
  return Object.keys(PRICES).find((k) => m.startsWith(k)) || m;
}

function cost(model, usage) {
  const p = PRICES[family(model)];
  if (!p || !usage) return 0;
  const cw1h =
    (usage.cache_creation && usage.cache_creation.ephemeral_1h_input_tokens) ||
    0;
  const cw5m = (usage.cache_creation_input_tokens || 0) - cw1h;
  return (
    ((usage.input_tokens || 0) * p.input +
      Math.max(0, cw5m) * p.input * 1.25 +
      cw1h * p.input * 2 +
      (usage.cache_read_input_tokens || 0) * p.cacheRead +
      (usage.output_tokens || 0) * p.output) /
    1e6
  );
}

const inputTokens = (u) =>
  (u.input_tokens || 0) +
  (u.cache_creation_input_tokens || 0) +
  (u.cache_read_input_tokens || 0);

/** What a benchmark request was for, from its shape (never its text). */
function benchmarkActivity(entry) {
  const req = entry.request;
  if (!req || !Array.isArray(req.messages)) return "benchmarks: other";
  if (req.stream) return "benchmarks: answer latency (streaming)";
  const content = req.messages[0] && req.messages[0].content;
  if (Array.isArray(content) && content.some((b) => b.type === "document")) {
    return "benchmarks: Claude's citations";
  }
  if (
    typeof content === "string" &&
    content.includes("<reference_documents>") &&
    content.includes("<claims>")
  ) {
    return "benchmarks: answer checks (judge)";
  }
  return "benchmarks: other";
}

const rows = new Map();
function add(activity, model, call) {
  const key = `${activity}\u0000${family(model)}`;
  if (!rows.has(key)) {
    rows.set(key, {
      activity,
      model: family(model),
      calls: 0,
      errors: 0,
      refusals: 0,
      inputTokens: 0,
      outputTokens: 0,
      usd: 0,
      estimatedUsd: 0,
      latencies: [],
      dates: new Set(),
    });
  }
  const r = rows.get(key);
  r.calls += 1;
  if (call.status && call.status >= 400) r.errors += 1;
  if (call.stopReason === "refusal") r.refusals += 1;
  r.inputTokens += call.inputTokens || 0;
  r.outputTokens += call.outputTokens || 0;
  r.usd += call.usd || 0;
  if (call.estimated) r.estimatedUsd += call.usd || 0;
  if (typeof call.latencyMs === "number") r.latencies.push(call.latencyMs);
  if (call.date) r.dates.add(call.date.slice(0, 10));
}

// 1. The benchmarks' response cache
let cacheEntries = 0;
if (fs.existsSync(CACHE)) {
  for (const file of fs.readdirSync(CACHE)) {
    if (!file.endsWith(".json")) continue;
    let e;
    try {
      e = JSON.parse(fs.readFileSync(path.join(CACHE, file), "utf8"));
    } catch {
      continue;
    }
    cacheEntries += 1;
    const http = e.http || {};
    const data = http.data || e.response || {};
    const usage = data.usage || e.usage || null;
    add(benchmarkActivity(e), e.model || (e.request && e.request.model), {
      status: http.status,
      stopReason: data.stop_reason,
      inputTokens: usage ? inputTokens(usage) : 0,
      outputTokens: usage ? usage.output_tokens || 0 : 0,
      usd: usage ? cost(e.model, usage) : e.estimatedUsd || 0,
      estimated: !usage && Boolean(e.estimatedUsd),
      latencyMs: http.latencyMs,
      date: e.createdAt,
    });
  }
}

// 2. The ledgers: one JSON line per call, written by
// scripts/consumer-journeys/ledger-hook.cjs
function readLedger(file, activityOf) {
  if (!fs.existsSync(file)) return 0;
  let n = 0;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    n += 1;
    const usage = {
      input_tokens: e.input_tokens || 0,
      output_tokens: e.output_tokens || 0,
    };
    add(activityOf(e), e.model, {
      status: e.status,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      usd: cost(e.model, usage),
      estimated: Boolean(e.estimated),
      latencyMs: e.latency_ms,
      date: e.ts,
    });
  }
  return n;
}
const consumerLines = readLedger(
  path.join(LEDGERS, "consumer-ledger.jsonl"),
  () => "consumer journeys (developer tests)",
);
const liveLines = readLedger(
  path.join(LEDGERS, "live-ledger.jsonl"),
  () => "live test suite",
);

const pct = (sorted, p) =>
  sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
    : null;
const round = (x, d = 4) => Number(x.toFixed(d));

const table = [...rows.values()]
  .map((r) => {
    const lat = r.latencies.sort((a, b) => a - b);
    const dates = [...r.dates].sort();
    return {
      activity: r.activity,
      model: r.model,
      calls: r.calls,
      errors: r.errors,
      refusals: r.refusals,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      usd: round(r.usd),
      ...(r.estimatedUsd > 0 && { estimatedUsd: round(r.estimatedUsd) }),
      latencyMs:
        lat.length > 0
          ? { p50: Math.round(pct(lat, 0.5)), p95: Math.round(pct(lat, 0.95)) }
          : null,
      firstDate: dates[0] || null,
      lastDate: dates[dates.length - 1] || null,
    };
  })
  .sort(
    (a, b) =>
      a.activity.localeCompare(b.activity) ||
      Object.keys(PRICES).indexOf(a.model) -
        Object.keys(PRICES).indexOf(b.model),
  );

const sum = (k) => table.reduce((n, r) => n + (r[k] || 0), 0);
const byModel = {};
for (const r of table) {
  const m = (byModel[r.model] = byModel[r.model] || {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    usd: 0,
  });
  m.calls += r.calls;
  m.inputTokens += r.inputTokens;
  m.outputTokens += r.outputTokens;
  m.usd = round(m.usd + r.usd);
}

const report = {
  report: "claude-usage",
  generatedAt: new Date().toISOString(),
  note: "Metadata only (model, date, status, tokens, latency): no prompt, answer or key.",
  prices: { perMillionTokens: PRICES, asOf: PRICES_AS_OF },
  sources: {
    benchmarkResponses: cacheEntries,
    consumerJourneyCalls: consumerLines,
    liveTestCalls: liveLines,
  },
  totals: {
    calls: sum("calls"),
    errors: sum("errors"),
    refusals: sum("refusals"),
    inputTokens: sum("inputTokens"),
    outputTokens: sum("outputTokens"),
    usd: round(sum("usd")),
  },
  byModel,
  rows: table,
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n");
console.log(
  `${report.totals.calls} calls, US$${report.totals.usd} (${cacheEntries} benchmark responses, ${consumerLines} journey calls, ${liveLines} live-test calls) -> ${path.relative(ROOT, OUTPUT)}`,
);
