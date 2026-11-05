#!/usr/bin/env node
/**
 * Latency of a RAG answer from Claude through the library: time to first
 * token and total time of createRagPipeline().run({ stream: true }) with
 * AnthropicConnector (default maxTokens), 3 retrieved passages, 30 fixed
 * queries per model (benchmarks/fixtures/claude-bench-plan.md).
 *
 * Queries: the first 30 SciFact claims of the seeded shuffle used by
 * benchmarks/claude-citations.js, asked as "What do the documents say about
 * this claim: <claim>". Corpus: the abstracts selected for those claims,
 * embedded with LocalEmbedder in a MemoryRetriever.
 *
 * Live calls, never cached: the times are the point. Each call's token
 * usage is written to benchmarks/.data/claude-cache/ as a ledger entry, so
 * spend is counted with everything else. One warm-up query per model is not
 * counted. One machine, one network, one date.
 *
 *   node benchmarks/claude-latency.js [--models=a,b] [--cap=88] [--output=file.json]
 */

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Transform } = require("stream");

const {
  createRagPipeline,
  AnthropicConnector,
  LocalEmbedder,
  MemoryRetriever,
  BM25Search,
} = require("../src/index.js");
const { liveAnthropic } = require("../__tests__/live/live-env.js");
const { loadSciFact } = require("./scifact");
const { mulberry32, shuffle } = require("./judge-datasets");
const { ClaudeCache, priceOf, costOf } = require("./claude-cache");
const { args, environment, percentile } = require("./claude-common");

const DEFAULT_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-haiku-5-5",
  "claude-sonnet-5-5",
  "claude-opus-5-5",
  "claude-fable-5-1",
];
const MODELS = args.models ? args.models.split(",") : DEFAULT_MODELS;
const SEED = 20261105;
const QUERIES = 30;
const CACHE_DIR = path.join(__dirname, ".data", "claude-cache");

/** The first QUERIES claims and their three abstracts, as in claude-citations.js. */
function selectCases({ documents, queries, qrels }) {
  const bm25 = new BM25Search();
  bm25.index(documents.map((d) => ({ id: d.id, content: d.content })));
  const byId = new Map(documents.map((d) => [d.id, d]));
  const ids = [...queries.keys()].sort((a, b) => Number(a) - Number(b));
  return shuffle(ids, mulberry32(SEED))
    .slice(0, QUERIES)
    .map((queryId) => {
      const claim = queries.get(queryId);
      const relevant = [...qrels.get(queryId).keys()]
        .filter((id) => byId.has(id))
        .sort((a, b) => Number(a) - Number(b))
        .slice(0, 3);
      const others = bm25
        .search(claim, { k: 20 })
        .map((r) => String(r.id))
        .filter((id) => !relevant.includes(id))
        .slice(0, 3 - relevant.length);
      return { claim, docIds: [...relevant, ...others] };
    });
}

/**
 * An axios adapter that sends the request for real and, for a streamed
 * reply, reads the usage from its events and writes a ledger entry.
 */
function ledgerAdapter(sink) {
  const http = require("axios").getAdapter("http"); // eslint-disable-line global-require
  return async (config) => {
    const body = JSON.parse(config.data);
    priceOf(body.model); // no call to a model without a price
    let response;
    try {
      response = await http(config);
    } catch (error) {
      // Keep the status and body only; the config holds the API key
      const e = new Error(
        `Claude API ${error.response ? error.response.status : "error"}: ${error.code || ""} ${error.message}`,
      );
      if (error.response) {
        e.response = { status: error.response.status, data: {} };
      }
      throw e;
    }
    if (config.responseType !== "stream") return response;
    const usage = {};
    let buffer = "";
    let written = false;
    // Written as soon as the final usage arrives: the connector stops
    // reading at message_stop, so the stream never reaches its end
    const record = () => {
      if (written) return;
      written = true;
      const entry = {
        key: `stream-${crypto.randomUUID()}`,
        kind: "stream",
        model: body.model,
        createdAt: new Date().toISOString(),
        request: body,
        response: { usage },
      };
      fs.writeFileSync(
        path.join(CACHE_DIR, `${entry.key}.json`),
        JSON.stringify(entry) + "\n",
      );
      sink.push(entry);
    };
    const tap = new Transform({
      transform(chunk, _enc, done) {
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "message_start" && event.message.usage) {
              Object.assign(usage, event.message.usage);
            }
            if (event.type === "message_delta" && event.usage) {
              Object.assign(usage, event.usage);
              record();
            }
          } catch {
            // partial or non-JSON line
          }
        }
        done(null, chunk);
      },
      flush(done) {
        record();
        done();
      },
    });
    tap.on("close", record);
    response.data.pipe(tap);
    return { ...response, data: tap };
  };
}

async function main() {
  const data = await loadSciFact(args["data-dir"]);
  const cases = selectCases(data);
  const byId = new Map(data.documents.map((d) => [d.id, d]));
  const docs = [...new Set(cases.flatMap((c) => c.docIds))].map((id) => ({
    id,
    content: byId.get(id).content,
  }));
  const embedder = new LocalEmbedder();
  embedder.train(docs);
  const retriever = new MemoryRetriever();
  await retriever.store(
    await Promise.all(
      docs.map(async (d) => ({
        id: d.id,
        content: d.content,
        vector: await embedder.embed(d.content),
      })),
    ),
  );
  const queries = cases.map(
    (c) => `What do the documents say about this claim: ${c.claim}`,
  );
  const { apiKey } = liveAnthropic();
  const cache = new ClaudeCache({ apiKey, capUSD: Number(args.cap || 88) });

  const report = {
    benchmark: "claude-latency",
    createdAt: new Date().toISOString(),
    environment: environment(),
    plan: "benchmarks/fixtures/claude-bench-plan.md",
    setup: {
      queries: queries.length,
      corpus: docs.length,
      topK: 3,
      maxTokens: "AnthropicConnector default",
      warmup: 1,
      note: "One machine, one network, one date; times include retrieval and the network round trip to api.anthropic.com.",
    },
    models: {},
  };

  for (const model of MODELS) {
    if (cache.spentUSD() >= cache.capUSD) throw new Error("Spend cap reached");
    const ledger = [];
    const llm = new AnthropicConnector({ apiKey, model });
    llm.client.defaults.adapter = ledgerAdapter(ledger);
    const pipeline = createRagPipeline({ embedder, retriever, llm });
    const runOne = async (query) => {
      const stream = await pipeline.run({
        query,
        options: { topK: 3, stream: true },
      });
      let timing = null;
      let text = "";
      for await (const chunk of stream) {
        if (chunk.token) text += chunk.token;
        if (chunk.done && chunk.timing) timing = chunk.timing;
      }
      return { timing, chars: text.length };
    };
    await runOne(queries[0]); // warm-up, not counted
    const runs = [];
    for (const q of queries) runs.push(await runOne(q));
    const ttft = runs
      .map((r) => r.timing.firstTokenMs)
      .filter((x) => x != null);
    const total = runs.map((r) => r.timing.totalMs);
    const cost = ledger.reduce(
      (n, e) => n + costOf(model, e.response.usage),
      0,
    );
    report.models[model] = {
      runs: runs.length,
      firstTokenMs: {
        p50: Math.round(percentile(ttft, 50)),
        p95: Math.round(percentile(ttft, 95)),
      },
      totalMs: {
        p50: Math.round(percentile(total, 50)),
        p95: Math.round(percentile(total, 95)),
      },
      noFirstToken: runs.length - ttft.length,
      answerCharsP50: percentile(
        runs.map((r) => r.chars),
        50,
      ),
      outputTokensP50: percentile(
        ledger.map((e) => e.response.usage.output_tokens || 0),
        50,
      ),
      calls: ledger.length,
      costUSD: Number(cost.toFixed(4)),
      date: new Date().toISOString().slice(0, 10),
    };
    const m = report.models[model];
    console.log(
      `${model}: TTFT p50 ${m.firstTokenMs.p50} ms p95 ${m.firstTokenMs.p95} ms; total p50 ${m.totalMs.p50} ms p95 ${m.totalMs.p95} ms; US$${m.costUSD}`,
    );
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
