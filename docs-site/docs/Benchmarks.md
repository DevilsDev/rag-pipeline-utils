---
id: Benchmarks
title: Benchmarks & Methodology
sidebar_label: Benchmarks
description: How we measure performance, how you reproduce the numbers, and how to benchmark your own end-to-end RAG pipeline honestly.
---

# Benchmarks & Methodology

We deliberately don't publish a headline "N ops/sec" figure for
`@devilsdev/rag-pipeline-utils`. RAG performance is dominated by factors
outside the framework: embedding model, vector store, LLM provider and
region, corpus size, hardware, and query distribution. A single number
hides all of that — and ages badly.

Instead, we ship:

1. A **deterministic framework-overhead suite** you run locally
2. A **methodology and harness template** for end-to-end benchmarks
   against _your_ actual stack

For the full methodology, run instructions, report schema, interpretation
guide, and end-to-end harness template, see the canonical document in
the repository:

:::tip The authoritative doc lives in the repo

**[BENCHMARKS.md on GitHub →](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/BENCHMARKS.md)**

It also ships in the published npm tarball as `BENCHMARKS.md` in the
package root, so it's available via `node_modules` inspection and on
the [npm package page](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils).

:::

## Quick start

Three presets ship in `package.json`:

```bash
# Fast sanity check (~30s)
npm run benchmark:quick

# Default suite (~2 min)
npm run benchmark

# Release-gate quality (~8 min)
npm run benchmark:full
```

Results land in `./benchmark-results/latest.json` plus a human-readable
summary printed to stdout.

## What the suite measures

Framework overhead only — in-process, network-free, deterministic:

| Category               | What it exercises                                     |
| ---------------------- | ----------------------------------------------------- |
| **DAG execution**      | 5 / 10 / 25 / 50-node linear chains                   |
| **Concurrent DAG**     | 20-node tree with parallelism 1 / 2 / 5 / 10          |
| **Retry policies**     | None / conservative / aggressive with simulated fails |
| **Structured logging** | JSON / console / correlated log output                |
| **Memory allocation**  | Array / Map / Set construction and processing         |
| **CPU intensive**      | Fibonacci + JSON round-trip + string ops              |

Each benchmark reports `mean`, `median`, `min`, `max`, `p95`, `p99`,
`standardDeviation`, `throughput`, `avgDeltaHeapUsed`, `peakHeapUsed`,
and `successRate`.

## What it does **not** measure

- Embedder throughput (provider-dependent)
- Retrieval latency (vector store + network-bound)
- LLM inference latency (model + region-bound)
- End-to-end query latency (dominated by the three above)
- Cost per query (provider pricing + tokens)

These are intentional omissions. Use the
[end-to-end harness template](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/BENCHMARKS.md#end-to-end-benchmarking-your-pipeline)
to measure them against your stack.

## Interpreting results

- **p50** is the typical experience
- **p95** is the tail a user will notice
- **p99** is where GC pauses, cold caches, and network hiccups live
- **Throughput** from the suite is in-process — it is **not** a
  statement about production service throughput under a real load mix.
  For realistic numbers build a load test against your HTTP surface
  with `autocannon`, `k6`, or `artillery`.

## Disclosure template

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

The JSON report auto-captures Node version, platform, arch, CPUs,
memory, and load average in its `environment` block.

## Common pitfalls

1. **No warmup** — first-iteration numbers are dominated by JIT and
   cold caches. Always discard a warmup window.
2. **Too few iterations** — 10 samples of a ~1ms operation is mostly
   noise. 100+ is a reasonable floor for framework benchmarks.
3. **Correlated runs** — running the suite twice back-to-back shows
   the second as faster because caches are warm.
4. **Shared hosts** — CI runners and laptops with open browsers add
   noise. Dedicated metal or bare VMs give the cleanest numbers.
5. **Streaming workloads** — retrieval latency is not end-to-end
   latency when the LLM streams. Measure time-to-first-token
   separately.

## See also

- **[BENCHMARKS.md in the repo](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/BENCHMARKS.md)** — canonical methodology, report schema, E2E harness
- [Performance guide](./Performance) — optimization strategies per component
- [`scripts/benchmark.js`](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/scripts/benchmark.js) — the harness source
