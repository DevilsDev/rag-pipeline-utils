# Benchmarks

This document describes **how we measure** performance in
`@devilsdev/rag-pipeline-utils` and **how you reproduce the numbers**
yourself. It deliberately does not publish a headline "N ops/sec" figure.

## Philosophy

Benchmark numbers that are not reproducible are marketing, not engineering.
RAG pipelines are particularly sensitive to factors outside the framework:
embedding model choice, vector store, LLM provider and region, corpus
size, query distribution, and hardware. A single number hides all of
that.

Instead, we ship:

- A **deterministic, in-process benchmark suite** that measures framework
  overhead — DAG execution, retry policies, logging, memory patterns.
  These numbers are comparable across runs on the same hardware and
  make regressions easy to catch.
- A **methodology and reference harness** that lets you benchmark your
  own end-to-end pipeline with your actual provider, data, and hardware.
  These are the only numbers that matter for your workload.

When you need a headline number for a decision, generate it on the
system you'll deploy to, with the providers you'll actually use.

## What the suite measures

The built-in suite (`scripts/benchmark.js`) exercises **framework
overhead only**. Every benchmark is in-process, network-free, and
deterministic up to GC and OS jitter.

| Category                                              | What it measures                                          | Why it matters                                         |
| ----------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------ |
| **DAG execution** (5 / 10 / 25 / 50 nodes)            | Linear chain of async nodes, cold and warm                | Baseline overhead of the pipeline orchestrator         |
| **Concurrent DAG** (1 / 2 / 5 / 10 parallelism)       | Tree of 20 nodes with configurable concurrency            | How well the engine scales intra-query parallelism     |
| **Retry policies** (none / conservative / aggressive) | Simulated 30% failure rate, retries with jittered backoff | Cost of reliability guarantees on the happy path       |
| **Structured logging** (JSON / console / correlated)  | Single log call with contextual payload                   | Per-log-line overhead when observability is on         |
| **Memory allocation**                                 | Array + Map + Set construction and processing             | Establishes a memory-pressure floor to compare against |
| **CPU intensive**                                     | Fibonacci + JSON round-trip + string ops                  | Sanity check against the hosting CPU                   |

Each benchmark reports:

- `mean`, `median`, `min`, `max` latency (ms)
- `p95`, `p99` latency (ms)
- `standardDeviation` (ms)
- `throughput` (ops/sec)
- `memory.avgDeltaHeapUsed`, `memory.peakHeapUsed`
- `successRate` (%) and `errors` count

All measurements include a warmup phase (default 10 iterations) and use
`perf_hooks.performance.now()` for timing. If the Node process is
started with `--expose-gc`, the suite forces a GC before each run.

## What the suite does **not** measure

The built-in suite does not exercise:

- **Embedder throughput** — provider- and model-dependent
- **Retrieval latency** — vector store, index size, and network bound
- **LLM inference latency** — model, region, and token-count bound
- **End-to-end query latency** — dominated by the three above
- **Cost per query** — provider pricing + token usage

These are intentional omissions. Claiming a number here without
disclosing the full stack would be misleading. Use the
**end-to-end harness template** below to measure them against your
actual stack.

## Running the suite

Three presets ship in `package.json`:

```bash
# 20 iterations per benchmark — fast sanity check (~30s)
npm run benchmark:quick

# 100 iterations, verbose — default (~2 min)
npm run benchmark

# 500 iterations, verbose — release-gate quality (~8 min)
npm run benchmark:full
```

Direct invocation:

```bash
node scripts/benchmark.js \
  --iterations 200 \
  --output ./my-results \
  --verbose

# With deterministic GC
node --expose-gc scripts/benchmark.js --iterations 200
```

Results are written to `./benchmark-results/`:

- `latest.json` — most recent run
- `benchmark-<timestamp>.json` — archived run

A human-readable summary is printed to stdout on completion.

## Environment disclosure template

When sharing benchmark numbers (issue reports, blog posts, PR descriptions),
include the following so they're interpretable:

```text
Package:      @devilsdev/rag-pipeline-utils@<version>
Node:         <version> (v8 <version>)
OS:           <distro/version>, kernel <version>
CPU:          <model>, <cores> cores, <base/boost GHz>
Memory:       <total GB>
Storage:      <NVMe/SSD/HDD>, <filesystem>
Container:    <bare-metal / Docker / K8s / Lambda / etc.>
Providers:    embedder=<…>, retriever=<…>, llm=<…>
Corpus:       <N documents, total tokens, chunk size>
Query set:    <N queries, source>
Iterations:   <N>, warmup: <N>
GC control:   --expose-gc=<yes/no>
```

The JSON report already captures `nodeVersion`, `platform`, `arch`,
`cpus`, `totalMemory`, and `loadAverage` automatically in its
`environment` block.

## Report schema

Each run produces a JSON document of the shape:

```json
{
  "timestamp": "2026-04-16T22:00:00.000Z",
  "environment": {
    "nodeVersion": "v20.x.x",
    "platform": "linux",
    "arch": "x64",
    "cpus": 8,
    "totalMemory": "16384MB",
    "loadAverage": [0.12, 0.08, 0.05]
  },
  "benchmarks": {
    "DAG execution (10 nodes)": {
      "iterations": 100,
      "errors": 0,
      "successRate": 100,
      "timing": {
        "mean": 0.0,
        "median": 0.0,
        "min": 0.0,
        "max": 0.0,
        "p95": 0.0,
        "p99": 0.0,
        "standardDeviation": 0.0
      },
      "memory": {
        "avgDeltaHeapUsed": "0KB",
        "totalHeapDelta": "0KB",
        "peakHeapUsed": "0KB"
      },
      "throughput": 0.0
    }
  },
  "meta": {
    "totalDuration": "0ms",
    "totalBenchmarks": 0,
    "completedAt": "2026-04-16T22:00:00.000Z"
  }
}
```

The numeric fields are intentionally left at `0.0` in this schema —
fill them by running the suite.

## End-to-end benchmarking your pipeline

The harness below is the minimal template for honest end-to-end numbers.
Adapt it to your pipeline, provider mix, and query distribution.

```js
// scripts/e2e-benchmark.mjs
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { createRagPipeline } from "@devilsdev/rag-pipeline-utils";

const pipeline = createRagPipeline({
  /* your real config — same as production */
});

const queries = [
  /* your real query set — at least 50 queries drawn from production logs */
];

const WARMUP = 10;
const ITERATIONS = 100;

async function run(query) {
  const t0 = performance.now();
  const result = await pipeline.run({ query });
  const t1 = performance.now();
  return {
    ms: t1 - t0,
    retrievedCount: result.results?.length ?? 0,
    answerChars: result.answer?.length ?? 0,
    tokens: result.usage?.totalTokens ?? null,
  };
}

// Warmup
for (let i = 0; i < WARMUP; i++) {
  await run(queries[i % queries.length]);
}

// Measured run
const samples = [];
for (let i = 0; i < ITERATIONS; i++) {
  samples.push(await run(queries[i % queries.length]));
}

const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
const percentile = (p) => ms[Math.floor(ms.length * p)];

const report = {
  timestamp: new Date().toISOString(),
  iterations: ITERATIONS,
  warmup: WARMUP,
  latencyMs: {
    mean: ms.reduce((a, b) => a + b, 0) / ms.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    min: ms[0],
    max: ms[ms.length - 1],
  },
  avgTokens: samples.reduce((a, b) => a + (b.tokens ?? 0), 0) / samples.length,
  avgRetrieved:
    samples.reduce((a, b) => a + b.retrievedCount, 0) / samples.length,
};

writeFileSync("e2e-benchmark.json", JSON.stringify(report, null, 2));
console.table(report.latencyMs);
```

Run it the same way on every comparison — same corpus, same query set,
same providers, same hardware. Don't compare a warm run to a cold one.

## Interpreting results

### Timing percentiles

- **mean** is easy to move around by outliers; don't report it alone
- **p50** (median) is the "typical" experience
- **p95** is the tail a user will notice
- **p99** is where GC, cold caches, and network hiccups live — useful
  for SLO design
- **standardDeviation** much larger than the mean signals high variance;
  your benchmark is probably too short, too concurrent, or sharing a
  noisy host

### Throughput

- Throughput is computed as `iterations / (mean_seconds)`. It's
  single-process throughput with the harness's concurrency settings —
  not a statement about your production service's throughput under a
  real load mix.
- If you want realistic multi-tenant throughput numbers, build a
  load-test harness (`autocannon`, `k6`, `artillery`) that hits the
  HTTP surface you actually deploy, not the library directly.

### Memory

- `avgDeltaHeapUsed` is the _growth per iteration_. Trending up across
  a long run means you have a leak.
- `peakHeapUsed` tells you the upper bound for right-sizing containers.
- On Windows or containerized Linux, RSS is not the same as heap used;
  prefer platform metrics for capacity planning.

### Common pitfalls

1. **No warmup** — first-iteration numbers are dominated by JIT and
   cold caches. Always discard a warmup window.
2. **Too few iterations** — 10 iterations on a ~1ms operation is mostly
   noise. 100+ is a reasonable floor for framework benchmarks;
   end-to-end benchmarks need enough iterations to cover your query
   distribution.
3. **Correlated runs** — running the suite twice back-to-back on a
   laptop will show the second run as faster because caches are warm.
   For comparisons, use fresh processes and cold caches, or explicitly
   measure warm paths.
4. **Shared hosts** — CI runners, personal machines with open browsers,
   and containers on bin-packed hosts all have neighbors that will add
   noise. Dedicated bare metal or bare VMs give the cleanest numbers.
5. **Stream-based workloads** — retrieval latency is not end-to-end
   latency when the LLM streams tokens. Measure time-to-first-token
   (TTFT) separately from total completion time.

## Regression testing in CI

The benchmark suite is deterministic enough to catch gross regressions
in CI. Recommended pattern:

1. Run `npm run benchmark:quick` on every PR against the default branch
2. Compare `latest.json` to the baseline in `main` using the keys in
   `benchmarks.*.timing.mean`
3. Fail the gate if any benchmark's mean regresses by more than a
   disclosed threshold (e.g. 25%)

This project does not yet gate on benchmark regressions in CI by default
— numbers on shared GitHub runners are too noisy to trust automatically.
If you run the suite on dedicated hardware as part of a release gate,
we'd welcome the workflow contribution.

## Contributing benchmark data

If you run the suite on a representative production-class host and want
to share the results:

1. Open a PR adding your report to `benchmark-results/community/` as
   `<hostname-slug>-<date>.json`
2. Include the full environment disclosure block above in the PR
   description
3. We will not average, normalize, or rank contributed numbers — they
   remain raw data points for other users comparing against similar
   hardware profiles

Community benchmark data is licensed under CC0 1.0 (public domain)
when contributed.

## See also

- [Performance guide](docs-site/docs/Performance.md) — optimization
  strategies by component (embedding, retrieval, LLM, memory)
- [`scripts/benchmark.js`](scripts/benchmark.js) — the benchmark
  harness source
- [SECURITY.md](SECURITY.md) — security hardening, not performance,
  but often on the same reviewer checklist
