#!/usr/bin/env node
// TEMPORARY diagnostics for the speed benchmark; removed before merge.
"use strict";

const http = require("http");
const { performance } = require("perf_hooks");
const { QdrantRetriever, PgVectorRetriever } = require("../src/index.js");

const DIMS = 384;
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
const gauss = (r) => r() + r() + r() - 1.5;
const norm = (v) => {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / n);
};
function randomVecs(n, r) {
  return Array.from({ length: n }, () =>
    norm(Array.from({ length: DIMS }, () => gauss(r))),
  );
}
function clusteredVecs(n, r, centroids) {
  return Array.from({ length: n }, () => {
    const c = centroids[Math.floor(r() * centroids.length)];
    return norm(c.map((x) => x + 0.35 * gauss(r)));
  });
}
function exact(corpus, q, k) {
  return corpus
    .map((v, i) => [i, v.reduce((s, x, d) => s + x * q[d], 0)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([i]) => `doc-${i}`);
}
const p50 = (xs) =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)].toFixed(2);

async function time(label, fn, n = 50) {
  for (let i = 0; i < 5; i++) await fn(i);
  const xs = [];
  for (let i = 0; i < n; i++) {
    const s = performance.now();
    await fn(i);
    xs.push(performance.now() - s);
  }
  console.log(`${label}: p50 ${p50(xs)} ms`);
}

async function qdrant() {
  const r = rng(1);
  const corpus = randomVecs(10000, r);
  const queries = randomVecs(50, r);
  const store = new QdrantRetriever({
    url: "http://127.0.0.1:6333",
    collection: "diag",
    dimensions: DIMS,
  });
  await store.clear();
  for (let i = 0; i < corpus.length; i += 500) {
    await store.store(
      corpus
        .slice(i, i + 500)
        .map((vector, j) => ({ id: `doc-${i + j}`, vector, content: "x" })),
    );
  }
  const info = await (
    await fetch("http://127.0.0.1:6333/collections/diag")
  ).json();
  console.log(
    "qdrant collection:",
    JSON.stringify({
      status: info.result.status,
      points: info.result.points_count,
      indexed: info.result.indexed_vectors_count,
      threshold: info.result.config.optimizer_config.indexing_threshold,
    }),
  );

  for (const url of ["http://localhost:6333", "http://127.0.0.1:6333"]) {
    const s = new QdrantRetriever({ url, collection: "diag" });
    await time(`qdrant retriever ${url}`, (i) =>
      s.retrieve({ queryVector: queries[i % 50], topK: 10 }),
    );
  }
  const body = (i, filter) =>
    JSON.stringify({
      query: queries[i % 50],
      limit: 10,
      with_payload: true,
      ...(filter && {
        filter: { must_not: [{ is_empty: { key: "rag_id" } }] },
      }),
    });
  for (const filter of [true, false]) {
    await time(`fetch 127.0.0.1 filter=${filter}`, (i) =>
      fetch("http://127.0.0.1:6333/collections/diag/points/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body(i, filter),
      }).then((res) => res.text()),
    );
  }
  const agent = new http.Agent({ keepAlive: true });
  await time(
    "http keepAlive noDelay filter=true",
    (i) =>
      new Promise((resolve, reject) => {
        const data = body(i, true);
        const req = http.request(
          {
            host: "127.0.0.1",
            port: 6333,
            path: "/collections/diag/points/query",
            method: "POST",
            agent,
            headers: {
              "content-type": "application/json",
              "content-length": Buffer.byteLength(data),
            },
          },
          (res) => {
            res.resume();
            res.on("end", resolve);
          },
        );
        req.on("socket", (s) => s.setNoDelay(true));
        req.on("error", reject);
        req.end(data);
      }),
  );
}

async function pgvector() {
  for (const kind of ["random", "clustered"]) {
    const r = rng(2);
    const centroids = randomVecs(100, r);
    const make = (n) =>
      kind === "random" ? randomVecs(n, r) : clusteredVecs(n, r, centroids);
    const corpus = make(10000);
    const queries = make(50);
    const truth = queries.map((q) => exact(corpus, q, 10));
    // One connection, so SET hnsw.ef_search applies to every query
    const pool = new (require("pg").Pool)({
      connectionString: process.env.PGVECTOR_URL,
      max: 1,
    });
    const store = new PgVectorRetriever({
      pool,
      table: `diag_${kind}`,
      dimensions: DIMS,
    });
    await store.clear().catch(() => {});
    const s0 = performance.now();
    for (let i = 0; i < corpus.length; i += 500) {
      await store.store(
        corpus
          .slice(i, i + 500)
          .map((vector, j) => ({ id: `doc-${i + j}`, vector, content: "x" })),
      );
    }
    console.log(
      `pgvector ${kind} ingest: ${Math.round(corpus.length / ((performance.now() - s0) / 1000))} docs/s`,
    );
    for (const ef of [40, 100, 200]) {
      await pool.query(`SET hnsw.ef_search = ${ef}`);
      let hits = 0;
      for (let q = 0; q < queries.length; q++) {
        const res = await store.retrieve({ queryVector: queries[q], topK: 10 });
        const t = new Set(truth[q]);
        hits += res.filter((x) => t.has(x.id)).length;
      }
      console.log(
        `pgvector ${kind} ef_search=${ef}: recall@10 ${(hits / 500).toFixed(3)}`,
      );
    }
    await store.clear();
    await pool.end();
  }
}

(async () => {
  await qdrant();
  await pgvector();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
