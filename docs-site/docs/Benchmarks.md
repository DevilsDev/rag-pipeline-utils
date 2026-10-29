---
id: Benchmarks
title: Benchmarks & Methodology
sidebar_label: Benchmarks
description: Published speed numbers for the pipeline and its vector stores, how they were measured, and how to reproduce them or benchmark your own stack.
---

# Benchmarks & Methodology

Most of a RAG query's time goes to things outside this library: the
embedding model, the vector store, the LLM and the network between them.
So the numbers here measure the two parts the library controls or ships:

1. **Pipeline overhead**: the time `createRagPipeline().run()` itself adds
   around your components.
2. **Vector stores**: ingest throughput, query latency and recall for the
   built-in stores and the pgvector and Qdrant connectors.

Everything is reproducible: the benchmark is
[`benchmarks/speed.js`](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/benchmarks/speed.js),
its data is generated from a fixed seed, and the tables below are written
by `benchmarks/render.js` from the committed report in
[`benchmarks/results/`](https://github.com/DevilsDev/rag-pipeline-utils/tree/main/benchmarks/results).
Nothing on this page is typed by hand.

## Speed results

<!-- bench:speed:start -->
<!-- bench:speed:end -->

## How to read these numbers

- **Pipeline overhead is small next to real components.** The components
  in this test return at once, so the times are the library's own work:
  stage orchestration, abort handling, result assembly. An embedding or
  LLM API call takes tens to thousands of milliseconds.
- **A cache hit costs more than an instant component.** With the cache on,
  each run hashes the query and looks up three layers, so it takes longer
  than calling components that cost nothing. The cache pays off when a
  real embedding or LLM call takes milliseconds; see [Caching](./Caching).
- **pgvector and Qdrant search approximately.** Both build an HNSW index,
  which trades a little recall for speed. Recall@10 is measured against an
  exact search over the same vectors. The vectors are random, which is
  harder for HNSW than real embeddings, so treat these recall figures as
  a floor. The memory and file stores search exactly and always reach
  1.000.
- **The databases ran on the same machine.** In CI, pgvector and Qdrant run
  as service containers on the GitHub Actions runner, so there is almost
  no network latency. A managed database in another zone adds its round
  trip to every query.
- **Shared runners are noisy.** GitHub's hosted runners share hardware, so
  runs vary by 10–20%. Compare numbers from the same run, not across runs.
- **`FileVectorStore` ingest includes writing the index file**, which is
  why it is much slower than `MemoryRetriever`; its queries scan every
  vector like the memory store.

## Reproduce them

```bash
# Memory and file stores only
npm run bench:speed

# With pgvector and Qdrant (Docker)
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=rag pgvector/pgvector:0.8.7-pg17
docker run -d -p 6333:6333 qdrant/qdrant:v1.20.0
PGVECTOR_URL=postgres://postgres:rag@localhost:5432/postgres \
QDRANT_URL=http://localhost:6333 \
  node benchmarks/speed.js --output=benchmark-results/speed.json
```

Options: `--sizes=1000,10000` (corpus sizes), `--dims=384`,
`--queries=200`, `--runs=5000` (pipeline runs), `--output=<file>`.

The published report comes from the **Benchmarks** workflow
(`.github/workflows/benchmarks.yml`), run by hand from the Actions tab.
It uploads the JSON report as an artifact; copy it to
`benchmarks/results/speed.json` and run `node benchmarks/render.js` to
update this page. CI fails when the page and the report disagree.

## Benchmark your own stack

For the pipeline in your `.ragrc.json` and its ingested index,
`rag-pipeline ai benchmark` reports measured p50, p95 and mean latency per
stage (`--queries <file>`, `--runs <n>`, `--top-k <n>`, `--json`). See the
[CLI reference](./CLI.md). For a full end-to-end harness, see the
[methodology in BENCHMARKS.md](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/BENCHMARKS.md#end-to-end-benchmarking-your-pipeline).

When sharing numbers (issues, blog posts, PRs), include:

```text
Package:      @devilsdev/rag-pipeline-utils@<version>
Node:         <version>
OS:           <distro/version>
CPU:          <model>, <cores>, <GHz>
Memory:       <total GB>
Container:    <bare-metal / Docker / K8s / Lambda>
Providers:    embedder=<…>, retriever=<…>, llm=<…>
Corpus:       <N documents, total tokens, chunk size>
Query set:    <N queries, source>
Iterations:   <N>, warmup: <N>
```

`benchmarks/speed.js` records the library version, commit, Node version,
CPU, cores, memory, runner and database images in its report.

## Common pitfalls

1. **No warmup**: first-iteration numbers are dominated by JIT and cold
   caches. Always discard a warmup window.
2. **Too few iterations**: 10 samples of a ~1 ms operation is mostly
   noise. 100+ is a reasonable floor.
3. **Correlated runs**: running twice back to back shows the second as
   faster because caches are warm.
4. **Shared hosts**: CI runners and laptops with open browsers add noise.
   Dedicated machines give the cleanest numbers.
5. **Streaming workloads**: retrieval latency is not end-to-end latency
   when the LLM streams. Measure time-to-first-token separately.

## Engine micro-benchmarks

A separate in-process suite times the DAG engine, retry policies,
structured logging and memory patterns. It is for catching regressions
in those modules, not for comparing with other tools:

```bash
npm run benchmark:quick   # ~30 s
npm run benchmark         # ~2 min
npm run benchmark:full    # ~8 min
```

Results land in `./benchmark-results/latest.json`. See
[`scripts/benchmark.js`](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/scripts/benchmark.js).

## See also

- **[BENCHMARKS.md in the repo](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/BENCHMARKS.md)**: methodology, report schema, end-to-end harness
- [Performance guide](./Performance): optimization strategies per component
- [Caching](./Caching): what the cache layers store and when they help
