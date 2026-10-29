#!/usr/bin/env node
/**
 * Speed benchmark: pipeline overhead and vector store latency.
 *
 * 1. Pipeline overhead: createRagPipeline().run() with components that
 *    return at once, so the time is the library's own work, with and
 *    without a cache.
 * 2. Vector stores: ingest throughput and query latency (p50/p95) for
 *    MemoryRetriever and FileVectorStore, and for PgVectorRetriever and
 *    QdrantRetriever when PGVECTOR_URL / QDRANT_URL are set. pgvector (HNSW)
 *    and Qdrant search approximately, so recall@10 against an exact search
 *    is reported next to their latency.
 *
 * Vectors are random unit vectors from a fixed seed, so every run uses the
 * same data. Usage:
 *
 *   node benchmarks/speed.js [--sizes=1000,10000] [--dims=384]
 *     [--queries=200] [--output=file.json]
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { performance } = require("perf_hooks");

const {
  createRagPipeline,
  MemoryRetriever,
  FileVectorStore,
  PgVectorRetriever,
  QdrantRetriever,
} = require("../src/index.js");
const { version } = require("../package.json");

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v = "true"] = a.slice(2).split("=");
      return [k, v];
    }),
);
const SIZES = (args.sizes || "1000,10000").split(",").map(Number);
const DIMS = Number(args.dims || 384);
const QUERIES = Number(args.queries || 200);
const WARMUP_QUERIES = 20;
const TOP_K = 10;
const BATCH = 500;
const PIPELINE_RUNS = Number(args.runs || 5000);
const PIPELINE_WARMUP = 500;
const SEED = 42;
const CLUSTERS = 100;

// mulberry32: small, fast, and the same sequence on every platform
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function unitVectors(count, dims, random) {
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    const v = new Array(dims);
    let norm = 0;
    for (let d = 0; d < dims; d++) {
      // Sum of uniforms, centred: close enough to Gaussian for direction
      const x = random() + random() + random() - 1.5;
      v[d] = x;
      norm += x * x;
    }
    norm = Math.sqrt(norm);
    for (let d = 0; d < dims; d++) v[d] /= norm;
    out[i] = v;
  }
  return out;
}

/**
 * Unit vectors around `clusters` random centres, like embeddings of a
 * corpus with topics. Uniformly random vectors would be the worst case
 * for approximate (HNSW) search and understate its recall.
 */
function clusteredVectors(count, centres, random, spread = 0.35) {
  return Array.from({ length: count }, () => {
    const c = centres[Math.floor(random() * centres.length)];
    const v = c.map((x) => x + spread * (random() + random() + random() - 1.5));
    const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
    return v.map((x) => x / norm);
  });
}

function exactTopK(corpus, query, k) {
  const scored = corpus.map((v, i) => {
    let dot = 0;
    for (let d = 0; d < v.length; d++) dot += v[d] * query[d];
    return [i, dot];
  });
  scored.sort((a, b) => b[1] - a[1]);
  return scored.slice(0, k).map(([i]) => `doc-${i}`);
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p) =>
    sorted[
      Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
    ];
  const mean = sorted.reduce((s, x) => s + x, 0) / sorted.length;
  return {
    p50: at(50),
    p95: at(95),
    p99: at(99),
    mean,
    samples: sorted.length,
  };
}

const round = (x, digits = 3) => Number(x.toFixed(digits));
const num = (x) => x.toLocaleString("en-US");
const roundStats = (s, digits) => ({
  p50: round(s.p50, digits),
  p95: round(s.p95, digits),
  p99: round(s.p99, digits),
  mean: round(s.mean, digits),
  samples: s.samples,
});

async function pipelineOverhead() {
  const docs = Array.from({ length: TOP_K }, (_, i) => ({
    id: `doc-${i}`,
    score: 1 - i / 100,
    content: `Document ${i}`,
  }));
  const components = {
    // cacheKey: without one a component isn't cached
    embedder: { embed: () => [1, 0, 0], cacheKey: "bench-embedder" },
    retriever: { retrieve: () => docs, cacheKey: "bench-retriever" },
    llm: { generate: () => "answer", cacheKey: "bench-llm" },
  };
  const variants = {
    "no cache": createRagPipeline(components),
    // Every run after the first is a hit in all three layers
    "memory cache, all hits": createRagPipeline({ ...components, cache: true }),
  };
  const results = {};
  for (const [name, pipeline] of Object.entries(variants)) {
    for (let i = 0; i < PIPELINE_WARMUP; i++) {
      await pipeline.run({ query: "q", options: { topK: TOP_K } });
    }
    const samples = [];
    for (let i = 0; i < PIPELINE_RUNS; i++) {
      const start = performance.now();
      const result = await pipeline.run({
        query: "q",
        options: { topK: TOP_K },
      });
      samples.push((performance.now() - start) * 1000);
      if (!result.success) throw new Error(`${name}: ${result.error}`);
      if (
        result.cache &&
        Object.values(result.cache).some((c) => c !== "hit")
      ) {
        throw new Error(
          `${name}: expected cache hits, got ${JSON.stringify(result.cache)}`,
        );
      }
    }
    results[name] = { unit: "µs", ...roundStats(stats(samples), 1) };
  }
  return results;
}

const EF_SEARCH = [40, 100, 200];

/** Waits until Qdrant has finished optimizing, then describes its index. */
async function qdrantIndex(url, collection) {
  let last = -1;
  for (let i = 0; i < 120; i++) {
    const res = await fetch(`${url}/collections/${collection}`);
    const { result } = await res.json();
    const indexed = result.indexed_vectors_count || 0;
    if (result.status === "green" && indexed === last) {
      return indexed > 0
        ? `HNSW (${num(indexed)} of ${num(result.points_count)} vectors indexed)`
        : "exact: below Qdrant's indexing threshold";
    }
    last = indexed;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Qdrant did not finish optimizing");
}

/** The stores that can run here, by name. */
function storeFactories(size) {
  const tmp = path.join(os.tmpdir(), `rag-bench-${process.pid}-${size}.json`);
  const factories = {
    MemoryRetriever: {
      create: () => new MemoryRetriever(),
      index: async () => "exact",
    },
    FileVectorStore: {
      create: () => {
        fs.rmSync(tmp, { force: true });
        return new FileVectorStore({ path: tmp });
      },
      // Ingest includes writing the index file
      afterStore: (store) => store.save(),
      cleanup: () => fs.rmSync(tmp, { force: true }),
      index: async () => "exact",
    },
  };
  if (process.env.PGVECTOR_URL) {
    const options = {
      connectionString: process.env.PGVECTOR_URL,
      table: `rag_bench_${size}`,
      dimensions: DIMS,
    };
    factories.PgVectorRetriever = {
      create: () => new PgVectorRetriever(options),
      index: async () => "HNSW (m 16, ef_construction 64)",
      // The same table queried at several efSearch settings
      variants: EF_SEARCH.map((efSearch) => ({
        label: `efSearch ${efSearch}${efSearch === 40 ? " (default)" : ""}`,
        open: () => new PgVectorRetriever({ ...options, efSearch }),
        close: (r) => r.close(),
      })),
      cleanup: async (store) => {
        await store.clear();
        await store.close();
      },
    };
  }
  if (process.env.QDRANT_URL) {
    const collection = `rag_bench_${size}`;
    factories.QdrantRetriever = {
      create: () =>
        new QdrantRetriever({
          url: process.env.QDRANT_URL,
          collection,
          dimensions: DIMS,
        }),
      index: () => qdrantIndex(process.env.QDRANT_URL, collection),
      cleanup: (store) => store.clear(),
    };
  }
  return factories;
}

async function timeQueries(retriever, queries, truth) {
  for (let i = 0; i < WARMUP_QUERIES; i++) {
    await retriever.retrieve({
      queryVector: queries[i % queries.length],
      topK: TOP_K,
    });
  }
  const samples = [];
  let hits = 0;
  for (let q = 0; q < queries.length; q++) {
    const start = performance.now();
    const results = await retriever.retrieve({
      queryVector: queries[q],
      topK: TOP_K,
    });
    samples.push(performance.now() - start);
    const expected = new Set(truth[q]);
    hits += results.filter((r) => expected.has(r.id)).length;
  }
  // A store must return topK results even when topK is large
  const many = await retriever.retrieve({ queryVector: queries[0], topK: 50 });
  if (many.length !== 50) {
    throw new Error(`topK 50 returned ${many.length} results`);
  }
  return {
    query: { unit: "ms", topK: TOP_K, ...roundStats(stats(samples), 3) },
    recallAt10: round(hits / (queries.length * TOP_K), 4),
  };
}

/** Results for one store: one row, or one per query setting. */
async function benchStore(factory, corpus, queries, truth) {
  const store = await factory.create();
  if (typeof store.clear === "function") await store.clear();
  const docs = corpus.map((vector, i) => ({
    id: `doc-${i}`,
    vector,
    content: `Document ${i}`,
  }));

  const ingestStart = performance.now();
  for (let i = 0; i < docs.length; i += BATCH) {
    await store.store(docs.slice(i, i + BATCH));
  }
  if (factory.afterStore) await factory.afterStore(store);
  const ingestMs = performance.now() - ingestStart;
  const ingest = {
    docsPerSecond: Math.round(docs.length / (ingestMs / 1000)),
    totalMs: round(ingestMs, 1),
    batchSize: BATCH,
  };
  const index = await factory.index(store);

  const rows = [];
  if (factory.variants) {
    for (const variant of factory.variants) {
      const retriever = variant.open();
      rows.push({
        setting: variant.label,
        index,
        ingest,
        ...(await timeQueries(retriever, queries, truth)),
      });
      await variant.close(retriever);
    }
  } else {
    rows.push({
      setting: null,
      index,
      ingest,
      ...(await timeQueries(store, queries, truth)),
    });
  }
  if (factory.cleanup) await factory.cleanup(store);
  return rows;
}

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
  const cpus = os.cpus();
  return {
    libraryVersion: version,
    commit,
    node: process.version,
    platform: `${os.platform()} ${os.release()}`,
    arch: os.arch(),
    cpu: cpus[0] ? cpus[0].model.trim() : "unknown",
    cores: cpus.length,
    memoryGB: round(os.totalmem() / 1024 ** 3, 1),
    runner: process.env.GITHUB_ACTIONS
      ? `GitHub Actions ${process.env.RUNNER_OS || ""} (${process.env.ImageOS || "hosted"})`.trim()
      : "local",
    services: {
      pgvector: process.env.PGVECTOR_IMAGE || null,
      qdrant: process.env.QDRANT_IMAGE || null,
    },
  };
}

async function main() {
  const report = {
    benchmark: "speed",
    createdAt: new Date().toISOString(),
    environment: environment(),
    settings: {
      seed: SEED,
      vectors: `unit vectors around ${CLUSTERS} random centres`,
      dims: DIMS,
      sizes: SIZES,
      queries: QUERIES,
      warmupQueries: WARMUP_QUERIES,
      pipelineRuns: PIPELINE_RUNS,
      pipelineWarmup: PIPELINE_WARMUP,
    },
    pipeline: null,
    stores: {},
  };

  console.log(`Pipeline overhead (${PIPELINE_RUNS} runs)…`);
  report.pipeline = await pipelineOverhead();
  for (const [name, s] of Object.entries(report.pipeline)) {
    console.log(`  ${name.padEnd(24)} p50 ${s.p50} µs  p95 ${s.p95} µs`);
  }

  for (const size of SIZES) {
    const random = rng(SEED + size);
    const centres = unitVectors(CLUSTERS, DIMS, random);
    const corpus = clusteredVectors(size, centres, random);
    const queries = clusteredVectors(QUERIES, centres, random);
    const truth = queries.map((q) => exactTopK(corpus, q, TOP_K));
    report.stores[size] = {};
    for (const [name, factory] of Object.entries(storeFactories(size))) {
      console.log(`${name} with ${num(size)} vectors…`);
      const rows = await benchStore(factory, corpus, queries, truth);
      report.stores[size][name] = rows;
      for (const r of rows) {
        console.log(
          `  ${r.setting || ""} ingest ${r.ingest.docsPerSecond}/s, query p50 ${r.query.p50} ms, p95 ${r.query.p95} ms, recall@10 ${r.recallAt10} [${r.index}]`,
        );
      }
    }
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
