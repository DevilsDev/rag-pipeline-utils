#!/usr/bin/env node
// TEMPORARY: does OllamaConnector pay a per-request stall like Qdrant's?
"use strict";

const http = require("http");
const { performance } = require("perf_hooks");
const { OllamaConnector } = require("../src/index.js");

const URL_ = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const MODEL = "all-minilm";
const p50 = (xs) =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)].toFixed(2);

async function time(label, fn, n = 40) {
  for (let i = 0; i < 5; i++) await fn(i);
  const xs = [];
  for (let i = 0; i < n; i++) {
    const s = performance.now();
    await fn(i);
    xs.push(performance.now() - s);
  }
  console.log(`${label}: p50 ${p50(xs)} ms`);
}

const text = (i) =>
  `Employees receive twenty days of paid vacation per year ${i}`;
const body = (i) => JSON.stringify({ model: MODEL, prompt: text(i) });

async function main() {
  const connector = new OllamaConnector({
    baseURL: URL_,
    embeddingModel: MODEL,
  });
  await time("OllamaConnector.embed (axios)", (i) => connector.embed(text(i)));
  const viaFetch = (headers) => (i) =>
    fetch(`${URL_}/api/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: body(i),
    }).then((r) => r.text());
  await time("fetch default", viaFetch({}));
  await time(
    "fetch accept-encoding identity",
    viaFetch({ "accept-encoding": "identity" }),
  );
  const agent = new http.Agent({ keepAlive: true });
  await time(
    "http keepAlive",
    (i) =>
      new Promise((resolve, reject) => {
        const data = body(i);
        const u = new URL(`${URL_}/api/embeddings`);
        const req = http.request(
          {
            host: u.hostname,
            port: u.port,
            path: u.pathname,
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
        req.on("error", reject);
        req.end(data);
      }),
  );
  const r = await fetch(`${URL_}/api/embeddings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept-encoding": "gzip, compress, deflate, br",
    },
    body: body(0),
  });
  await r.text();
  console.log(
    "response headers (gzip accepted):",
    JSON.stringify(Object.fromEntries(r.headers)),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
