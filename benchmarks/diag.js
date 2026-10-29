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

  const body = (i) =>
    JSON.stringify({ query: queries[i % 50], limit: 10, with_payload: true });
  const URL_ = "http://127.0.0.1:6333/collections/diag/points/query";
  const viaFetch = (headers) => (i) =>
    fetch(URL_, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: body(i),
    }).then((res) => res.text());
  const agent = new http.Agent({ keepAlive: true });
  const viaHttp =
    ({ noDelay, split, headers = {} }) =>
    (i) =>
      new Promise((resolve, reject) => {
        const data = body(i);
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
              ...headers,
            },
          },
          (res) => {
            res.resume();
            res.on("end", resolve);
          },
        );
        if (noDelay) req.on("socket", (sock) => sock.setNoDelay(true));
        req.on("error", reject);
        if (split) {
          req.flushHeaders();
          setImmediate(() => req.end(data));
        } else req.end(data);
      });
  const fetchHeaders = {
    accept: "*/*",
    "accept-language": "*",
    "sec-fetch-mode": "cors",
    "user-agent": "node",
    "accept-encoding": "gzip, deflate",
  };
  await time("fetch default", viaFetch({}));
  await time(
    "fetch accept-encoding identity",
    viaFetch({ "accept-encoding": "identity" }),
  );
  await time("fetch connection close", viaFetch({ connection: "close" }));
  await time("http noDelay single-write", viaHttp({ noDelay: true }));
  await time("http no-noDelay single-write", viaHttp({ noDelay: false }));
  await time(
    "http noDelay split-write",
    viaHttp({ noDelay: true, split: true }),
  );
  await time(
    "http no-noDelay split-write",
    viaHttp({ noDelay: false, split: true }),
  );
  await time(
    "http noDelay fetch-headers",
    viaHttp({ noDelay: true, headers: fetchHeaders }),
  );
  const fr = await fetch(URL_, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body(0),
  });
  await fr.text();
  console.log(
    "fetch response headers:",
    JSON.stringify(Object.fromEntries(fr.headers)),
  );
  await new Promise((resolve) => {
    const data = body(0);
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
        console.log("http response headers:", JSON.stringify(res.headers));
        res.resume();
        res.on("end", resolve);
      },
    );
    req.end(data);
  });
}

async function pgvector() {
  const { Pool } = require("pg");
  const r = rng(2);
  const centroids = randomVecs(100, r);
  const corpus = clusteredVecs(10000, r, centroids);
  const queries = clusteredVecs(50, r, centroids);
  const truth = queries.map((q) => exact(corpus, q, 10));
  const docs = corpus.map((vector, j) => ({
    id: `doc-${j}`,
    vector,
    content: "x",
  }));
  for (const index of ["hnsw", "none"]) {
    const store = new PgVectorRetriever({
      connectionString: process.env.PGVECTOR_URL,
      table: `diag_${index}`,
      dimensions: DIMS,
      index,
    });
    await store.clear().catch(() => {});
    const s0 = performance.now();
    for (let i = 0; i < docs.length; i += 500)
      await store.store(docs.slice(i, i + 500));
    console.log(
      `pgvector index=${index} ingest: ${Math.round(docs.length / ((performance.now() - s0) / 1000))} docs/s`,
    );
    if (index === "hnsw") {
      const rows = await store.retrieve({ queryVector: queries[0], topK: 50 });
      console.log(`pgvector topK=50 at default ef_search: ${rows.length} rows`);
      for (const ef of [40, 100, 200]) {
        const pool = new Pool({
          connectionString: process.env.PGVECTOR_URL,
          options: `-c hnsw.ef_search=${ef}`,
        });
        const tuned = new PgVectorRetriever({ pool, table: "diag_hnsw" });
        let hits = 0;
        const xs = [];
        for (let q = 0; q < queries.length; q++) {
          const t0 = performance.now();
          const res = await tuned.retrieve({
            queryVector: queries[q],
            topK: 10,
          });
          xs.push(performance.now() - t0);
          const t = new Set(truth[q]);
          hits += res.filter((x) => t.has(x.id)).length;
        }
        const big = await tuned.retrieve({ queryVector: queries[0], topK: 50 });
        console.log(
          `pgvector ef_search=${ef} (pool options): recall@10 ${(hits / 500).toFixed(3)}, p50 ${p50(xs)} ms, topK=50 rows ${big.length}`,
        );
        await pool.end();
      }
    }
    await store.clear();
    await store.close();
  }
}

(async () => {
  await qdrant();
  await pgvector();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
