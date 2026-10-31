"use strict";

/**
 * `rag-pipeline ai benchmark`: time real queries against the configured
 * pipeline and index. Every number reported is measured here.
 */

const fs = require("fs");
const { embedQuery } = require("../../utils/embed-query");
const { loadComponents, query } = require("./rag-service");
const { summarize } = require("./bench-stats");

const SAMPLE_QUERIES = 5;
const SAMPLE_WORDS = 8;

/**
 * Read queries from a file: a JSON array of strings, or one query per line.
 * @param {string} file
 * @returns {string[]}
 */
function readQueryFile(file) {
  if (!fs.existsSync(file)) throw new Error(`Queries file not found: ${file}`);
  const text = fs.readFileSync(file, "utf8");
  const trimmed = text.trim();
  let queries;
  if (trimmed.startsWith("[")) {
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      throw new Error(
        `Queries file ${file} is not valid JSON: ${error.message}`,
      );
    }
    if (!parsed.every((q) => typeof q === "string")) {
      throw new Error(`Queries file ${file} must be a JSON array of strings`);
    }
    queries = parsed;
  } else {
    queries = text.split(/\r?\n/);
  }
  queries = queries.map((q) => q.trim()).filter(Boolean);
  if (queries.length === 0) throw new Error(`No queries found in ${file}`);
  return queries;
}

/**
 * Deterministic sample: the first words of the first few indexed chunks.
 * @param {Array<{content: string}>} chunks
 * @returns {string[]}
 */
function sampleQueries(chunks, count = SAMPLE_QUERIES) {
  return chunks
    .map((c) => String(c.content).split(/\s+/).filter(Boolean))
    .filter((words) => words.length > 0)
    .slice(0, count)
    .map((words) => words.slice(0, SAMPLE_WORDS).join(" "));
}

const elapsedMs = (start) => Number(process.hrtime.bigint() - start) / 1e6;

async function timed(fn) {
  const start = process.hrtime.bigint();
  const value = await fn();
  return { value, ms: elapsedMs(start) };
}

/**
 * @param {object} params
 * @param {object} params.config
 * @param {string} params.configDir
 * @param {string} [params.queriesFile]
 * @param {number} [params.runs=3] - Passes over the query set
 * @param {number} [params.topK=3]
 * @param {boolean} [params.streaming=false] - Stream the end-to-end answers
 *   and measure time to first token (needs an llm stage)
 * @returns {Promise<object>} Measured report
 */
async function runBenchmark({
  config,
  configDir,
  queriesFile,
  runs = 3,
  topK = 3,
  streaming = false,
}) {
  const setup = await timed(() => loadComponents({ config, configDir }));
  const components = setup.value;
  const { embedder, retriever, reranker, llm } = components;

  const queries = queriesFile
    ? readQueryFile(queriesFile)
    : sampleQueries(retriever.list ? await retriever.list() : []);
  if (queries.length === 0) {
    throw new Error(
      "No queries: pass --queries <file> (the index has no text to sample from).",
    );
  }

  // Streaming only changes anything with an llm: it measures first tokens.
  const streamed = Boolean(streaming && llm);
  const ask = (question) =>
    query({
      components,
      question,
      topK,
      ...(streamed && { onToken: () => {} }),
    });

  // First query pays one-time costs (lazy init, JIT); reported, not counted.
  const warmup = await timed(() => ask(queries[0]));

  const samples = {
    embed: [],
    retrieve: [],
    rerank: [],
    firstToken: [],
    endToEnd: [],
  };
  const resultCounts = [];
  for (let run = 0; run < runs; run++) {
    for (const question of queries) {
      const embedded = await timed(() => embedQuery(embedder, question));
      samples.embed.push(embedded.ms);
      const retrieved = await timed(() =>
        retriever.retrieve({
          query: question,
          queryVector: embedded.value,
          topK,
        }),
      );
      samples.retrieve.push(retrieved.ms);
      if (reranker) {
        const reranked = await timed(() =>
          reranker.rerank(question, retrieved.value, { topK }),
        );
        samples.rerank.push(reranked.ms);
      }
      const e2e = await timed(() => ask(question));
      if (streamed && e2e.value.firstTokenMs != null) {
        samples.firstToken.push(e2e.value.firstTokenMs);
      }
      samples.endToEnd.push(e2e.ms);
      resultCounts.push(e2e.value.results.length);
    }
  }

  const stages = {
    embed: summarize(samples.embed),
    retrieve: summarize(samples.retrieve),
    ...(reranker && { rerank: summarize(samples.rerank) }),
    ...(samples.firstToken.length && {
      firstToken: summarize(samples.firstToken),
    }),
    endToEnd: summarize(samples.endToEnd),
  };

  return {
    queries,
    queriesSource: queriesFile || "sampled from indexed chunks",
    runs,
    topK,
    setupMs: setup.ms,
    warmupMs: warmup.ms,
    stages,
    includesGeneration: Boolean(llm),
    streaming: streamed,
    results: {
      min: Math.min(...resultCounts),
      max: Math.max(...resultCounts),
    },
    environment: {
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      chunks: retriever.size ? await retriever.size() : null,
      embedder: components.names.embedder,
      dimensions: retriever.getEmbedderInfo?.()?.dimensions ?? null,
      retriever: components.names.retriever,
      reranker: components.names.reranker || null,
      llm: components.names.llm || null,
    },
  };
}

module.exports = { runBenchmark, readQueryFile, sampleQueries };
