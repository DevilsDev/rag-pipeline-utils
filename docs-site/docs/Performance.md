# Performance Optimization Guide

This guide covers the performance controls that **@devilsdev/rag-pipeline-utils** actually provides: per-run timeouts and cancellation, batched and streaming embedding, reranker caching and concurrency, bounded in-memory retrieval, and tools for measuring latency and cost. Anything not listed here (connection pools for a hosted vector database, model-side tuning) belongs to the provider SDK or service you plug in.

---

## **Measuring First**

### **From the CLI**

```bash
# Measured p50/p95/mean latency per stage for the configured pipeline and index
rag-pipeline ai benchmark

# Time a single query end to end
time rag-pipeline query "test" --json

# Memory, config size and other performance checks
rag-pipeline doctor --category performance
```

`ai benchmark` takes `--queries <file>` (JSON array of strings or one per line; by default queries are sampled from the index), `--runs <n>` (default 3), `--top-k <n>` and `--json`. The repository's internal benchmark suite (DAG engine, retry policy, monitoring overhead) runs with `npm run benchmark` from a clone; retrieval speed and quality benchmarks run with `npm run bench:speed` and `npm run bench:quality` (see [Benchmarks](./Benchmarks.md)).

### **In your application**

`ExecutionTracer` wraps a pipeline and records the duration of each run and its steps:

```javascript no-run
const {
  createRagPipeline,
  ExecutionTracer,
} = require("@devilsdev/rag-pipeline-utils");

const pipeline = createRagPipeline({ embedder, retriever, llm });

const tracer = new ExecutionTracer({ captureInputs: false });
const traced = tracer.trace(pipeline);

await traced.run({ query: "What is RAG?" });

const [trace] = tracer.getTraces();
console.log(
  trace.totalDurationMs,
  trace.steps.map((s) => s.durationMs),
);
```

`MetricsAggregator` keeps rolling latency, throughput, cost and error statistics, and `DashboardGenerator` renders them as a self-contained HTML page or a text report:

```javascript no-run
const fs = require("fs");
const {
  MetricsAggregator,
  DashboardGenerator,
} = require("@devilsdev/rag-pipeline-utils");

const aggregator = new MetricsAggregator();

const start = Date.now();
const result = await pipeline.run({ query: "What is RAG?" });
aggregator.recordQuery({
  duration: Date.now() - start,
  success: result.success,
});

const snapshot = aggregator.getSnapshot(); // { latency, throughput, cost, memory, errorRate, ... }
fs.writeFileSync("dashboard.html", new DashboardGenerator().generate(snapshot));
```

`MetricsAggregator` only knows what you record with `recordQuery`, `recordEmbedding`, `recordRetrieval`, `recordGeneration`, `recordError` and `recordMemory`.

### **Profiling**

```bash
# Inspect memory during a large ingest
node --inspect --max-old-space-size=4096 \
  node_modules/@devilsdev/rag-pipeline-utils/bin/cli.js ingest ./large-dataset

# Profile CPU usage (writes a .cpuprofile file to the current directory)
node --cpu-prof node_modules/@devilsdev/rag-pipeline-utils/bin/cli.js \
  query "test"
```

---

## **Bounding Latency: Timeouts and Cancellation**

`createRagPipeline` creates an `AbortController` for every run. A `timeout` or a caller-supplied `signal` aborts the run, no later stage starts, and the signal is passed to every component call, so built-in connectors and rerankers cancel their in-flight requests:

```javascript
const controller = new AbortController();

const result = await pipeline.run({
  query: "Summarise the refund policy",
  options: {
    topK: 5,
    timeout: 10000, // resolves { success: false, error: 'Execution timeout' }
    signal: controller.signal, // abort() resolves { success: false, error: 'Execution aborted' }
  },
});
```

`run()` resolves rather than throws in both cases. Custom components receive the signal as `retriever.retrieve({ ..., signal })`, `embedder.embed(text, { signal })` / `embedQuery(text, { signal })`, `reranker.rerank(query, docs, { topK, signal })` and `llm.generate(query, docs, { ..., signal })`; components that ignore it still work, but their work is not cancelled.

### **Streaming for perceived latency**

With `stream: true`, `run()` returns an async iterable of `{ token, done }` chunks. If the LLM has no `generateStream()`, the pipeline falls back to `generate()` and emits the whole answer as one chunk:

```javascript
const stream = await pipeline.run({
  query: "What is RAG?",
  options: { stream: true, citations: true },
});

for await (const chunk of stream) {
  if (chunk.done) {
    console.log("\ncitations:", chunk.citations); // final chunk when citations/evaluate are on
  } else {
    process.stdout.write(chunk.token);
  }
}
```

---

## **Embedding Throughput**

### **Connector retries**

Built-in connectors retry only transient failures (network errors, HTTP 408/409/425/429/5xx) with exponential backoff, jitter and `Retry-After`. Tune `maxRetries` (default 3) and `retryDelay` (base delay, default 1000 ms) on the connector:

```javascript
const { OpenAIConnector } = require("@devilsdev/rag-pipeline-utils");

const openai = new OpenAIConnector({
  embeddingModel: "text-embedding-3-small", // default
  maxRetries: 3,
  retryDelay: 1000,
});
```

### **Streaming embeddings**

`StreamingEmbedder` embeds a large document set in batches and yields results as they complete, applying backpressure when heap usage approaches `maxMemoryMB`:

```javascript no-run
const { StreamingEmbedder } = require("@devilsdev/rag-pipeline-utils");

const streamer = new StreamingEmbedder(myEmbedder, {
  batchSize: 50, // default
  maxConcurrency: 3, // default
  maxMemoryMB: 512, // default
  backpressureThreshold: 0.8, // fraction of maxMemoryMB, default
});

// documents: [{ id, content }]
for await (const { id, vector, progress } of streamer.embedStream(documents)) {
  console.log(id, `${(progress * 100).toFixed(0)}% complete`);
}

// Or collect everything: const all = await streamer.embedAll(documents);
```

`StreamingEmbedder` is an `EventEmitter` (`start`, `embedding`, `batch`, `backpressure`, `done`, `error`); `getStats()` returns cumulative statistics. The lower-level `createEmbeddingStream` is exported as well.

### **Parallel batches**

`ParallelProcessor.ParallelEmbedder` splits text chunks into batches and embeds them with a concurrency limit and per-batch retries. By default (`mode: "auto"`) it calls `embedBatch(texts)` when the embedder has one, embeds one text at a time for the built-in connectors, and otherwise calls `embed(batch)` with an array of strings. Force a strategy with `mode: "batch"` or `mode: "single"`:

```javascript no-run
const { ParallelProcessor } = require("@devilsdev/rag-pipeline-utils");

const parallel = new ParallelProcessor.ParallelEmbedder(batchEmbedder, {
  batchSize: 10, // default
  maxConcurrency: 3, // default
  retryAttempts: 2, // default
  mode: "auto", // default
});

const vectors = await parallel.embedBatch(chunks); // chunks: string[]
```

---

## **Retrieval and Reranking**

- **Index choice.** `MemoryRetriever` holds all vectors in memory and compares every one per query; it enforces `maxDocuments` (default 100000) and, with `eviction: "fifo"`, drops the oldest documents instead of throwing when full. `FileVectorStore` (the CLI's `file-store` retriever) persists the index to JSON, stores mostly-zero vectors sparsely and rounds values to 7 significant digits (about 10x smaller files for the `local` embedder). Both do an exhaustive cosine scan; for large corpora use `PgVectorRetriever` (PostgreSQL with pgvector, HNSW) or `QdrantRetriever`, or plug in another store as a custom retriever.
- **`topK`.** Retrieve only what the next stage needs. With a reranker, retrieve more candidates and let the reranker cut them down.
- **`EmbeddingReranker`** caches document embeddings in an LRU (`cacheSize`, default 1000; `0` disables) and limits concurrent embedding calls (`concurrency`, default 4). Call `clearCache()` after retraining the embedder.
- **`CascadeReranker`** lets a cheap reranker (for example `ScoringReranker`) prune candidates before an expensive one runs.

```javascript no-run
const { EmbeddingReranker } = require("@devilsdev/rag-pipeline-utils");

// embedder must expose embedQuery(text) or embed(text)
const reranker = new EmbeddingReranker(embedder, {
  cacheSize: 5000,
  concurrency: 4,
});

const pipeline = createRagPipeline({ embedder, retriever, reranker, llm });
```

---

## **Generation Cost and Tokens**

Cap the context sent to the LLM with `run({ options: { maxContextTokens } })` (from 3.1.0; see [packContext](./API-Reference.md#packcontext)), which keeps the best-ranked documents that fit. Use smaller models and lower `maxTokens` on the LLM connector where quality allows (`OpenAIConnector` defaults: `model: "gpt-4o-mini"`, `maxTokens: 4096`, `temperature: 0.7`).

`CostTracker` wraps a pipeline and attaches a cost estimate to every result; with `enableBudget` it enforces a `TokenBudget`:

```javascript no-run
const { CostTracker } = require("@devilsdev/rag-pipeline-utils");

const tracker = new CostTracker({
  model: "gpt-4o-mini",
  enableBudget: true,
  budgetOptions: { maxCost: 5 }, // USD
});
const tracked = tracker.wrap(pipeline);

const result = await tracked.run({ query: "What is RAG?" });
console.log(result.cost); // { inputTokens, outputTokens, estimatedCost, model, currency }
console.log(tracker.getSummary()); // { totalTokens, totalCost, sessionCount, avgCostPerQuery, breakdown }
```

Built-in prices are list prices marked unverified (see `PRICING_METADATA` for their `asOf` date and sources). Pass your own prices through `calculatorOptions` (`pricing` / `customPricing`) when the numbers matter.

---

## **Production Deployment**

```dockerfile
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
# Size the heap to the container's memory limit
ENV NODE_OPTIONS="--max-old-space-size=4096"

COPY package*.json ./
RUN npm ci --omit=dev --no-audit

COPY . .
CMD ["node", "index.js"]
```

The pipeline object holds no per-request state, so you can scale horizontally behind a load balancer as long as every instance can reach the same index. A `FileVectorStore` index is a local file: share it read-only or rebuild it per instance, and do not write to it from several processes at once. See the [deployment guides](./Deployment-Docker.md) for container and orchestration setups.

---

## **Checklist**

- [ ] Measure with `rag-pipeline ai benchmark` or `ExecutionTracer` before tuning
- [ ] Set `options.timeout` (or pass an `AbortSignal`) on every user-facing run
- [ ] Stream answers to users when latency matters
- [ ] Keep `topK` small; rerank a larger candidate set only if it improves quality
- [ ] Bound memory: `maxDocuments` / `eviction` on `MemoryRetriever`, `cacheSize` on `EmbeddingReranker`
- [ ] Track token cost with `CostTracker` and set a budget

Reference figures for the built-in stores and retrievers, measured in CI, are on the [Benchmarks](./Benchmarks.md) page. Your numbers depend on your providers, models, corpus and hardware, so measure your own.

---

_For troubleshooting performance issues, see the [Troubleshooting Guide](./Troubleshooting.md)._
