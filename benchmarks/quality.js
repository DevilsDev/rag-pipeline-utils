#!/usr/bin/env node
/**
 * Retrieval-quality benchmark on BEIR SciFact: nDCG@10, Recall@10,
 * Recall@100 and MRR@10 for the retrievers that run offline, with their
 * default settings.
 *
 * - BM25Search
 * - LocalEmbedder (TF-IDF) + MemoryRetriever
 * - HybridRetriever fusing the two with reciprocal rank fusion
 * - HashEmbedder (the /testing stand-in) + MemoryRetriever, as a floor
 *
 * No API key or model is needed, so these are offline baselines, not
 * figures for neural embedders. Usage:
 *
 *   node benchmarks/quality.js [--data-dir=dir] [--output=file.json]
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { performance } = require("perf_hooks");

const {
  BM25Search,
  LocalEmbedder,
  MemoryRetriever,
  HybridRetriever,
} = require("../src/index.js");
const { HashEmbedder } = require("../src/testing.js");
const { version } = require("../package.json");
const { loadSciFact } = require("./scifact");
const { evaluateRuns } = require("./metrics");

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v = "true"] = a.slice(2).split("=");
      return [k, v];
    }),
);
const DEPTH = 100; // results per query, for Recall@100

const round = (x) => Number(x.toFixed(4));

async function vectorRetriever(embedder, documents) {
  const store = new MemoryRetriever();
  const vectors = [];
  for (const doc of documents) vectors.push(await embedder.embed(doc.content));
  await store.store(
    documents.map((doc, i) => ({
      id: doc.id,
      vector: vectors[i],
      content: doc.content,
    })),
  );
  return store;
}

const embedQuery = (embedder, text) =>
  embedder.embedQuery ? embedder.embedQuery(text) : embedder.embed(text);

/** Each system: build its index, then answer one query with ranked ids. */
const SYSTEMS = {
  BM25Search: async (documents) => {
    const bm25 = new BM25Search();
    bm25.index(documents);
    return async (text) => bm25.search(text, { k: DEPTH }).map((r) => r.id);
  },
  "LocalEmbedder + MemoryRetriever": async (documents) => {
    const embedder = new LocalEmbedder();
    embedder.train(documents);
    const store = await vectorRetriever(embedder, documents);
    return async (text) =>
      (
        await store.retrieve({
          queryVector: await embedQuery(embedder, text),
          topK: DEPTH,
        })
      ).map((r) => r.id);
  },
  "HybridRetriever (BM25 + LocalEmbedder)": async (documents) => {
    const bm25 = new BM25Search();
    bm25.index(documents);
    const embedder = new LocalEmbedder();
    embedder.train(documents);
    const store = await vectorRetriever(embedder, documents);
    const hybrid = new HybridRetriever([
      { retriever: bm25, name: "bm25" },
      { retriever: store, name: "tfidf" },
    ]);
    return async (text) =>
      (
        await hybrid.retrieve({
          query: text,
          queryVector: await embedQuery(embedder, text),
          topK: DEPTH,
        })
      ).map((r) => r.id);
  },
  "HashEmbedder + MemoryRetriever": async (documents) => {
    const embedder = new HashEmbedder();
    const store = await vectorRetriever(embedder, documents);
    return async (text) =>
      (
        await store.retrieve({
          queryVector: await embedder.embed(text),
          topK: DEPTH,
        })
      ).map((r) => r.id);
  },
};

function environment() {
  let commit = null;
  try {
    commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: path.join(__dirname, ".."),
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    // not a git checkout
  }
  return {
    libraryVersion: version,
    commit,
    node: process.version,
    platform: `${os.platform()} ${os.release()}`,
    runner: process.env.GITHUB_ACTIONS
      ? `GitHub Actions ${process.env.RUNNER_OS || ""}`.trim()
      : "local",
  };
}

async function main() {
  const { documents, queries, qrels, source } = await loadSciFact(
    args["data-dir"],
  );
  console.log(
    `${source.dataset}: ${documents.length} documents, ${queries.size} queries`,
  );

  const report = {
    benchmark: "quality",
    createdAt: new Date().toISOString(),
    environment: environment(),
    dataset: {
      ...source,
      documents: documents.length,
      queries: queries.size,
      judgements: [...qrels.values()].reduce((n, m) => n + m.size, 0),
    },
    depth: DEPTH,
    systems: {},
  };

  for (const [name, build] of Object.entries(SYSTEMS)) {
    const start = performance.now();
    const search = await build(documents);
    const indexMs = performance.now() - start;
    const runs = new Map();
    const queryStart = performance.now();
    for (const [id, text] of queries) runs.set(id, await search(text));
    const queryMs = performance.now() - queryStart;
    const scores = evaluateRuns(runs, qrels);
    report.systems[name] = {
      ...Object.fromEntries(
        Object.entries(scores).map(([k, v]) => [k, round(v)]),
      ),
      indexSeconds: Number((indexMs / 1000).toFixed(1)),
      msPerQuery: Number((queryMs / queries.size).toFixed(2)),
    };
    const s = report.systems[name];
    console.log(
      `${name.padEnd(40)} nDCG@10 ${s.ndcg10}  R@10 ${s.recall10}  R@100 ${s.recall100}  MRR@10 ${s.mrr10}`,
    );
  }

  if (args.output) {
    fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
    fs.writeFileSync(args.output, JSON.stringify(report, null, 2) + "\n");
    console.log(`Report written to ${args.output}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
