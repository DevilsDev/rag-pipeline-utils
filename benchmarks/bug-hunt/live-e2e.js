#!/usr/bin/env node
/**
 * Bug hunt 5: live end-to-end (benchmarks/fixtures/bug-hunt-plan.md).
 *
 *   node benchmarks/bug-hunt/live-e2e.js
 *
 * Run under scripts/consumer-journeys/ledger-hook.cjs (NODE_OPTIONS
 * --require) with RAG_LEDGER and RAG_LEDGER_HARD_CAP_USD: streaming calls
 * can't go through benchmarks/claude-cache.js, so the ledger's hard cap is
 * this hunt's cap (non-streaming Citations calls also use ClaudeCache).
 * claude-haiku-5-5 throughout, except the temperature-retry measurement,
 * which also uses claude-sonnet-5-5 (short replies). Live results are leads;
 * a bug counts once an offline test reproduces it (from a recorded reply).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { liveAnthropic } = require("../../__tests__/live/live-env.js");
const { ClaudeCache, PRICES, costOf } = require("../claude-cache");
const { args, environment } = require("../claude-common");
const rag = require("../../src/index.js");

const ROOT = path.join(__dirname, "..", "..");
const RESULTS_FILE = path.join(
  ROOT,
  "benchmarks",
  "results",
  "bug-hunt-live.json",
);
const RECORD_DIR = path.join(ROOT, "benchmarks", ".data", "bug-hunt-live");
const MODEL = "claude-haiku-5-5";
const { apiKey } = liveAnthropic();

const DOCS = [
  {
    id: "vacation",
    content:
      "Full-time employees receive twenty days of paid vacation per year. Unused days can be carried over for up to twelve months.",
    metadata: { source: "vacation.md" },
  },
  {
    id: "remote",
    content:
      "Remote work is allowed two days per week with manager approval. Employees must be reachable from 10:00 to 15:00.",
    metadata: { source: "remote.md" },
  },
  {
    id: "parking",
    content:
      "Parking at the main office is free for all employees. Visitors park in the north lot.",
    metadata: { source: "parking.md" },
  },
];

const report = {
  generatedAt: new Date().toISOString(),
  environment: environment(),
  model: MODEL,
  checks: {},
  leads: [],
};
const lead = (check, detail) => report.leads.push({ check, detail });

/** Count the HTTP requests a connector makes, with status and latency. */
function instrument(connector) {
  const log = [];
  connector.client.interceptors.request.use((config) => {
    config.metadata = { start: Date.now() };
    return config;
  });
  connector.client.interceptors.response.use(
    (res) => {
      log.push({
        status: res.status,
        ms: Date.now() - res.config.metadata.start,
        usage: res.data && res.data.usage,
      });
      return res;
    },
    (err) => {
      const c = err.config || {};
      log.push({
        status: err.response ? err.response.status : 0,
        ms: c.metadata ? Date.now() - c.metadata.start : null,
      });
      return Promise.reject(err);
    },
  );
  return log;
}

async function retriever() {
  const embedder = new rag.LocalEmbedder();
  embedder.train(DOCS.map((d) => d.content));
  const r = new rag.MemoryRetriever();
  await r.store(DOCS.map((d) => ({ ...d, vector: embedder.embed(d.content) })));
  return { embedder, retriever: r };
}

const claude = (options = {}) =>
  new rag.AnthropicConnector({
    apiKey,
    model: MODEL,
    maxTokens: 200,
    ...options,
  });

async function temperatureRetry() {
  const out = {};
  for (const model of ["claude-sonnet-5-5", "claude-haiku-5-5"]) {
    const c = new rag.AnthropicConnector({ apiKey, model, maxTokens: 20 });
    const log = instrument(c);
    const calls = [];
    for (let i = 0; i < 3; i++) {
      const before = log.length;
      const t = Date.now();
      await c.generate("Reply with the single word OK.", [], {});
      const mine = log.slice(before);
      calls.push({
        requests: mine.length,
        statuses: mine.map((x) => x.status),
        totalMs: Date.now() - t,
        failedRequestMs: mine
          .filter((x) => x.status === 400)
          .reduce((s, x) => s + x.ms, 0),
      });
    }
    out[model] = calls;
    if (calls.every((c) => c.requests > 1)) {
      lead(
        "temperature retry",
        `${model}: every generate() call made ${calls.map((c) => c.requests).join(", ")} requests; the failed 400 added ${calls.map((c) => c.failedRequestMs).join(", ")} ms`,
      );
    }
  }
  report.checks.temperatureRetry = out;
}

async function parity() {
  const { embedder, retriever: r } = await retriever();
  const pipeline = rag.createRagPipeline({
    embedder,
    retriever: r,
    llm: claude(),
  });
  const query =
    "How many vacation days do full-time employees get, and can they carry them over?";
  let text = "";
  let done = null;
  for await (const chunk of await pipeline.run({
    query,
    options: { stream: true, topK: 2, citations: true, evaluate: true },
  })) {
    text += chunk.token || "";
    if (chunk.done) done = chunk;
  }
  fs.mkdirSync(RECORD_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(RECORD_DIR, "parity.json"),
    JSON.stringify({ query, text, done }, null, 2),
  );
  const replay = rag.createRagPipeline({
    embedder,
    retriever: r,
    llm: { generate: async () => text },
  });
  const run = await replay.run({
    query,
    options: { topK: 2, citations: true, evaluate: true },
  });
  const pick = (x) =>
    JSON.stringify({
      citations: x.citations,
      evaluation:
        x.evaluation && x.evaluation.scores
          ? x.evaluation.scores
          : x.evaluation,
      sources: (x.results || []).map((d) => d.id),
    });
  const same = done && pick(done) === pick(run);
  report.checks.parity = {
    finalChunkHasCitations: Boolean(done && done.citations),
    finalChunkHasEvaluation: Boolean(done && done.evaluation),
    firstTokenMs: done && done.timing ? done.timing.firstTokenMs : null,
    runAndStreamAgree: same,
  };
  if (!done || !done.citations || !done.evaluation)
    lead("final chunk", "the final stream chunk lacks citations or evaluation");
  if (!(done && done.timing && done.timing.firstTokenMs > 0))
    lead("firstTokenMs", "timing.firstTokenMs not set on the stream");
  if (!same)
    lead(
      "run vs stream",
      `for the same answer, run() and the stream's final chunk differ: stream ${pick(done || {}).slice(0, 300)} vs run ${pick(run).slice(0, 300)}`,
    );
}

async function abortAndTimeout() {
  const { embedder, retriever: r } = await retriever();
  const c = claude({ maxTokens: 400 });
  const log = instrument(c);
  const pipeline = rag.createRagPipeline({ embedder, retriever: r, llm: c });
  const controller = new AbortController();
  const chunks = [];
  let error = null;
  try {
    for await (const chunk of await pipeline.run({
      query: "Write three paragraphs about the vacation policy.",
      options: {
        stream: true,
        topK: 2,
        citations: true,
        evaluate: true,
        signal: controller.signal,
      },
    })) {
      chunks.push(chunk);
      if (chunks.length === 1) controller.abort();
    }
  } catch (e) {
    error = e.message;
  }
  const doneChunk = chunks.find((x) => x.done);
  report.checks.abort = {
    chunksAfterAbort: chunks.length,
    error,
    doneChunkWithQuality: Boolean(
      doneChunk && (doneChunk.citations || doneChunk.evaluation),
    ),
    requests: log.length,
  };
  if (doneChunk && (doneChunk.citations || doneChunk.evaluation))
    lead(
      "abort",
      "after an abort mid-stream, a later stage (citations/evaluation) still ran",
    );
  // timeout
  const t = Date.now();
  const res = await pipeline
    .run({
      query: "Write three paragraphs about the vacation policy.",
      options: { timeout: 5, topK: 2 },
    })
    .catch((e) => ({ thrown: e.message }));
  report.checks.timeout = {
    ms: Date.now() - t,
    result:
      res.thrown ||
      res.error ||
      (res.success === false ? "failed" : "succeeded"),
  };
  if (!(res.thrown || res.success === false))
    lead("timeout", `a 5 ms timeout did not fire (${Date.now() - t} ms)`);
}

async function costTracker() {
  const { embedder, retriever: r } = await retriever();
  const c = claude();
  const log = instrument(c);
  const tracker = new rag.CostTracker({ model: MODEL });
  const pipeline = tracker.wrap(
    rag.createRagPipeline({ embedder, retriever: r, llm: c }),
  );
  const result = await pipeline.run({
    query: "How many vacation days do I get?",
    options: { topK: 2 },
  });
  const usage = log.filter((x) => x.usage).map((x) => x.usage);
  const actual = usage.reduce(
    (s, u) => ({
      input: s.input + (u.input_tokens || 0),
      output: s.output + (u.output_tokens || 0),
      cost: s.cost + costOf(MODEL, u),
    }),
    { input: 0, output: 0, cost: 0 },
  );
  report.checks.costTracker = {
    tracked: result.cost,
    actual,
    pricesTable: PRICES[MODEL],
  };
  const rel = (a, b) => (b ? Math.abs(a - b) / b : null);
  if (result.cost && rel(result.cost.estimatedCost, actual.cost) > 0.5) {
    lead(
      "CostTracker",
      `estimated cost ${result.cost.estimatedCost} vs actual ${actual.cost.toFixed(6)} (usage x PRICES): off by ${(100 * rel(result.cost.estimatedCost, actual.cost)).toFixed(0)}%`,
    );
  }
}

async function router() {
  const { embedder, retriever: r } = await retriever();
  const routerLlm = rag.createModelRouter({
    routes: [
      {
        model: "claude-sonnet-5-5",
        llm: claude({ model: "claude-sonnet-5-5" }),
        handles: ["simple"],
      },
      { model: MODEL, llm: claude(), handles: ["simple"] },
    ],
  });
  const pipeline = rag.createRagPipeline({
    embedder,
    retriever: r,
    llm: routerLlm,
  });
  const result = await pipeline.run({
    query: "How many vacation days?",
    options: { topK: 1 },
  });
  report.checks.router = { route: result.route };
  if (!result.route || result.route.model !== MODEL)
    lead(
      "router",
      `two routes for "simple": chose ${result.route && result.route.model}, cheaper is ${MODEL}`,
    );
}

async function packContextEstimate() {
  const text = DOCS.map((d) => d.content)
    .join("\n\n")
    .repeat(8);
  const packed = rag.packContext([{ id: "all", content: text }], {
    maxTokens: 100000,
  });
  const res = await fetch(
    "https://api.anthropic.com/v1/messages/count_tokens",
    {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: text }],
      }),
    },
  );
  const counted = await res.json();
  const real = counted.input_tokens;
  report.checks.packContext = {
    estimated: packed.tokens,
    counted: real,
    ratio: real ? packed.tokens / real : null,
    status: res.status,
  };
  if (real && Math.abs(packed.tokens / real - 1) > 0.25)
    lead(
      "packContext",
      `estimate ${packed.tokens} vs counted ${real} input tokens for ${MODEL} (ratio ${(packed.tokens / real).toFixed(2)})`,
    );
}

async function citations(cache) {
  const body = {
    model: MODEL,
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: [
          ...DOCS.map((d) => ({
            type: "document",
            source: { type: "text", media_type: "text/plain", data: d.content },
            title: d.id,
            citations: { enabled: true },
          })),
          {
            type: "text",
            text: "How many vacation days do full-time employees get, and how often can they work remotely? Cite the documents.",
          },
        ],
      },
    ],
  };
  const r = await cache.messages(body);
  fs.mkdirSync(RECORD_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(RECORD_DIR, "citations-response.json"),
    JSON.stringify(r.data, null, 2),
  );
  const input = rag.fromAnthropicCitations(r.data, {
    documents: DOCS.map((d) => d.content),
  });
  const checked = await rag.verifyCitations(input);
  report.checks.verifyCitations = {
    claims: checked.claims.length,
    verdicts: checked.claims.map((c) => ({
      verdict: c.verdict,
      lexicalReason: c.lexicalReason,
      text: c.text.slice(0, 120),
    })),
  };
  const unsupported = checked.claims.filter((c) => c.verdict === "unsupported");
  if (unsupported.length)
    lead(
      "verifyCitations",
      `${unsupported.length} of ${checked.claims.length} real Claude-cited claims marked unsupported: ${unsupported.map((c) => `"${c.text.slice(0, 80)}" (${c.lexicalReason})`).join("; ")}`,
    );
}

async function main() {
  if (!apiKey) throw new Error("no key (see __tests__/live/live-env.js)");
  if (!String(process.env.NODE_OPTIONS || "").includes("ledger-hook"))
    throw new Error("run under the ledger hook (it enforces the cap)");
  const cache = new ClaudeCache({ apiKey, capUSD: Number(args.cap || 0) });
  for (const [name, f] of [
    ["temperature retry", temperatureRetry],
    ["parity", parity],
    ["abort and timeout", abortAndTimeout],
    ["CostTracker", costTracker],
    ["router", router],
    ["packContext", packContextEstimate],
    ["verifyCitations", () => citations(cache)],
  ]) {
    try {
      await f();
      console.log(`done: ${name}`);
    } catch (e) {
      report.leads.push({ check: name, detail: `error: ${e.message}` });
      console.log(`error: ${name}: ${e.message}`);
    }
  }
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report.checks, null, 1).slice(0, 3000));
  for (const l of report.leads) console.log(`LEAD ${l.check}: ${l.detail}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
