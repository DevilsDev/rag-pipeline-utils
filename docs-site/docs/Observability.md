# Observability & Monitoring

**@devilsdev/rag-pipeline-utils** ships small, dependency-free observability helpers: a structured logger, in-process metrics primitives, an execution tracer, a metrics aggregator with an HTML dashboard, and cost tracking. They are all exported from the main entry. There are no `/observability` subpaths, no built-in Prometheus endpoint and no alerting engine. From 3.2.0, `createRagPipeline({ telemetry: true })` emits [OpenTelemetry spans](#opentelemetry). Feed the data these helpers produce into the monitoring stack you already run.

`createRagPipeline()` does not record metrics or events on its own. You wrap the pipeline (`ExecutionTracer`, `CostTracker`) or record what you need around `run()`.

---

## What is available

| Need                          | Export                                    | Output                                                              |
| ----------------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| Structured logs               | `logger`                                  | JSON lines via pino (pretty output with the optional `pino-pretty`) |
| Counters, gauges, histograms  | `metrics`                                 | In-memory metric objects, JSON export                               |
| Pipeline event history        | `eventLogger`                             | In-memory event list, JSON export                                   |
| Per-run traces                | `ExecutionTracer`, `TraceInspector`       | Trace records, bottleneck and anomaly analysis                      |
| Distributed tracing           | `createRagPipeline({ telemetry })`        | From 3.2.0: OpenTelemetry spans for each run and stage              |
| Rolling metrics and dashboard | `MetricsAggregator`, `DashboardGenerator` | Snapshot object, standalone HTML, text report                       |
| Cost per run                  | `CostTracker`, `TokenBudget`              | `result.cost`, session summaries                                    |
| Quality per run               | `run({ options: { evaluate: true } })`    | `result.evaluation` scores                                          |
| Health endpoint (local)       | `DevServer` / `rag-pipeline serve`        | `GET /health` on 127.0.0.1                                          |

---

## Structured Logging

The `logger` export is the logger module: `{ logger, createLogger, correlationMiddleware, StructuredLogger }`.

```javascript
const { logger: logging } = require("@devilsdev/rag-pipeline-utils");

logging.logger.info("Pipeline initialized", {
  stages: ["embedder", "retriever", "llm"],
});
logging.logger.performance("pipeline.run", 182, { topK: 3 });
logging.logger.audit("index.rebuilt", { documents: 1200 });

// Child logger carrying a correlation id on every line
const requestLog = logging.createLogger("req-123", { tenantId: "acme" });
requestLog.warn("Slow retrieval", { durationMs: 950 });
```

- Methods: `info`, `warn`, `error` and `debug` take `(message, meta)`. Console-style calls such as `logger.error("Failed:", msg)` are also handled.
- The level comes from `LOG_LEVEL` (for example `debug`, `info`, `warn`, `error`).
- `correlationMiddleware` is Express-style middleware. It reads or creates an `x-correlation-id` header and attaches `req.logger`.
- Output is JSON lines on stdout. Ship them with your log collector (Fluent Bit, Vector, CloudWatch agent, and so on).

---

## Metrics

The `metrics` export provides `Counter`, `Gauge`, `Histogram`, `MetricsRegistry`, `PipelineMetrics` and a shared `pipelineMetrics` instance.

```javascript no-run
const { createRagPipeline, metrics } = require("@devilsdev/rag-pipeline-utils");

const registry = new metrics.MetricsRegistry();
const queries = registry.getOrCreateCounter("rag_queries_total", "Queries run");
const failures = registry.getOrCreateCounter(
  "rag_query_failures_total",
  "Failed queries",
);
const latency = registry.getOrCreateHistogram(
  "rag_query_duration_ms",
  "Query latency (ms)",
);

const pipeline = createRagPipeline({ embedder, retriever, llm });

async function answer(query) {
  const start = Date.now();
  const result = await pipeline.run({ query });
  latency.observe(Date.now() - start);
  queries.inc();
  if (!result.success) failures.inc();
  return result;
}

console.log(latency.getPercentiles([50, 95, 99]));
console.log(registry.exportMetrics()); // JSON string
```

`exportMetrics()` returns JSON, not the Prometheus text format. To scrape the numbers with Prometheus, expose them through a client such as `prom-client` in your own service.

- **Names are per type.** `getOrCreateCounter`, `getOrCreateHistogram` and `getOrCreateGauge` return the metric already registered under a name, and throw a `TypeError` when that name belongs to a metric of another type (before 2.7.1 they returned it anyway).
- **An empty histogram** reports `mean` 0 and `min` and `max` as `null` from `getStatistics()`.
- **`pipelineMetrics`** counts every error type passed to `recordError(type, component)` in `getSummary().errors`, and tracks running operations in the `operationsActive` gauge.

---

## Event Log

`eventLogger.PipelineEventLogger` keeps an in-memory history of pipeline events:

```javascript
const { eventLogger } = require("@devilsdev/rag-pipeline-utils");

const events = new eventLogger.PipelineEventLogger();
events.logStageStart("retrieval");
events.logStageEnd("retrieval", 42, { results: 3 });
events.logEvent("custom.cache_miss", eventLogger.EventSeverity.INFO, {
  key: "q1",
});

console.log(events.getSessionStats());
console.log(events.exportEvents()); // JSON string
```

Every event it records has an `eventLogger.EventTypes` entry (`PLUGIN_START`, `PLUGIN_END`, `PLUGIN_ERROR`, `STAGE_START`, `STAGE_END`, `STAGE_ERROR`, `MEMORY_WARNING`) and an `EventSeverity` (`DEBUG`, `INFO`, `WARN`, `ERROR`), so you can filter `getEventHistory({ eventType, severity })` with the constants rather than strings.

---

## Tracing

`ExecutionTracer.trace(pipeline)` returns a wrapped pipeline. Each `run()` is recorded with its input, output, duration, result count and citation and evaluation data, and the trace is attached as `result.trace`. Traces are kept in memory as JSON snapshots, so `exportTraces('json')` serializes them. (In 2.5.0 it throws a "circular structure" error with the default `captureOutputs: true`; fixed in 2.6.0.)

```javascript no-run
const {
  createRagPipeline,
  ExecutionTracer,
  TraceInspector,
} = require("@devilsdev/rag-pipeline-utils");

const tracer = new ExecutionTracer({
  captureInputs: true,
  maxPayloadSize: 10000,
});
const traced = tracer.trace(createRagPipeline({ embedder, retriever, llm }));

tracer.on("traced", (trace) => console.log(trace.id, trace.totalDurationMs));
const result = await traced.run({
  query: "What is RAG?",
  options: { citations: true, evaluate: true },
});

const inspector = new TraceInspector();
console.log(inspector.analyze(result.trace)); // summary, timeBreakdown, bottleneck, qualityMetrics, recommendations
console.log(inspector.findAnomalies(tracer.getTraces()));
```

The tracer records the run as a whole, not each stage separately. For per-stage latency of the configured pipeline, use `rag-pipeline ai benchmark`. It reports p50, p95 and mean latency for query embedding, retrieval, reranking and end-to-end queries.

For distributed tracing, see [OpenTelemetry](#opentelemetry) below.

## OpenTelemetry

:::info[Coming in 3.2.0]

The `telemetry` option ships in the next release.

:::

`createRagPipeline({ telemetry: true })` records each run as an OpenTelemetry span, with a child span for every stage call it makes. Install the API, an optional peer dependency, alongside the OpenTelemetry SDK your service already uses:

```bash
npm install @opentelemetry/api
```

```js no-run
import { createRagPipeline } from "@devilsdev/rag-pipeline-utils";

const pipeline = createRagPipeline({
  embedder,
  retriever,
  llm,
  telemetry: true, // uses the global tracer provider your SDK registered
});
```

Without a registered tracer provider the spans are no-ops, so leaving `telemetry: true` on costs nothing. To use a specific tracer, pass `telemetry: { tracer }`.

A run produces spans like these, nested under whatever span is active when you call `run()` (an HTTP request, for example):

```
rag.pipeline.run
├── embeddings text-embedding-3-small
├── retrieval rag_documents
├── rerank
└── chat gpt-4o-mini
```

The stage spans follow the OpenTelemetry [GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai), which are still at Development status and may change:

| Span                      | Kind     | Attributes                                                                                                                                                                                                                                                                |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rag.pipeline.run`        | internal | `rag.top_k`, `rag.stream`, `rag.success`, `rag.result_count`, `rag.answered`, `rag.groundedness` (with citations), `rag.cache.<layer>`, `rag.packing.*` (with `maxContextTokens`), `rag.time_to_first_token_ms` (streams), `error.type` (`timeout`, `aborted` or `error`) |
| `embeddings <model>`      | client   | `gen_ai.operation.name: "embeddings"`, `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.embeddings.dimension.count`                                                                                                                                                |
| `retrieval <data source>` | client   | `gen_ai.operation.name: "retrieval"`, `gen_ai.data_source.id` (the Qdrant collection or pgvector table), `gen_ai.retrieval.top_k`, `rag.retrieval.result_count`                                                                                                           |
| `rerank`                  | internal | `rag.rerank.input_count`, `rag.rerank.output_count`, `rag.rerank.top_k`                                                                                                                                                                                                   |
| `chat <model>`            | client   | `gen_ai.operation.name: "chat"`, `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.request.temperature`, `gen_ai.request.max_tokens`, `gen_ai.request.stream`, `gen_ai.response.time_to_first_chunk` (streams, in seconds)                                          |

- **Nothing you or your users typed is recorded by default.** Spans carry counts, durations, models, cache outcomes and packing, never query text, documents or answers. `telemetry: { recordContent: true }` adds the query (`rag.query.text`, `gen_ai.retrieval.query.text`) and the retrieved document ids and scores (`gen_ai.retrieval.documents`); traces are often sent to third parties, so turn it on deliberately.
- A failed stage sets its span's status to ERROR with an exception event. `run()` resolves `{ success: false }` rather than throwing, and its span carries the error too. A run that times out or is aborted ends with `error.type: "timeout"` or `"aborted"`.
- A streamed answer's `chat` span and the run span end when the stream finishes, fails or the reader stops early.
- For a stream, `gen_ai.response.time_to_first_chunk` on the `chat` span is the model's own latency: seconds from the `generateStream` call to its first chunk. `rag.time_to_first_token_ms` on the run span is what the user waited, from the call to `run()` to the first non-empty token, retrieval included; it is the stream's `timing.firstTokenMs`.
- A stage served from the [cache](./Caching.md) has no span; the run span's `rag.cache.<layer>` attribute says it was a hit.
- `gen_ai.provider.name` and the model come from the built-in connectors. Your own plugins get spans too, without them.
- Stage calls run inside their span, so HTTP spans from auto-instrumentation (`@opentelemetry/instrumentation-undici`, for example) nest under the stage that made them.
- `AgenticPipeline`, guardrail filtering (`filterResults`) and the loader don't get their own spans; their time shows in the run span.

---

## Metrics Dashboard

`MetricsAggregator` keeps a rolling window of operations. `DashboardGenerator` renders a snapshot as a self-contained HTML page (inline CSS and SVG) or as a text report.

```javascript no-run
const fs = require("fs");
const {
  MetricsAggregator,
  DashboardGenerator,
} = require("@devilsdev/rag-pipeline-utils");

const aggregator = new MetricsAggregator({ windowSize: 60 });

const start = Date.now();
const result = await pipeline.run({ query: "What is RAG?" });
aggregator.recordQuery({
  duration: Date.now() - start,
  success: result.success,
});
if (!result.success)
  aggregator.recordError({ message: result.error, source: "pipeline" });
aggregator.recordMemory();

const snapshot = aggregator.getSnapshot();
const dashboard = new DashboardGenerator({
  title: "RAG Pipeline",
  theme: "light",
});
fs.writeFileSync("dashboard.html", dashboard.generate(snapshot));
console.log(dashboard.generateReport(snapshot));
```

The aggregator also has `recordEmbedding`, `recordRetrieval` and `recordGeneration` (each `{ duration, tokens?, cost?, success? }`) and `getTimeSeries(metric)` for `latency`, `throughput`, `cost`, `memory` or `errors`.

---

## Cost and Quality

- **Cost:** `new CostTracker({ model }).wrap(pipeline)` adds `result.cost` (`inputTokens`, `outputTokens`, `estimatedCost`, `model`, `currency`) and keeps a summary. Built-in prices are unverified list prices (see `PRICING_METADATA`). See [Enterprise: Cost Controls](./Enterprise.md#cost-controls).
- **Quality:** `run({ query, options: { evaluate: true, referenceAnswer } })` adds `result.evaluation` with faithfulness, relevance, context precision, groundedness and, when a reference answer is given, context recall. See [Evaluation](./Evaluation.md).

---

## Health Checks

The library has no health-check framework. In your own service, a readiness check can run a cheap query (for example `topK: 1` with `timeout`) and report `result.success`:

```javascript
async function ready() {
  const result = await pipeline.run({
    query: "health check",
    options: { topK: 1, timeout: 2000 },
  });
  return result.success;
}
```

For local development, `rag-pipeline serve` (or `DevServer`) exposes `GET /health` and `POST /query` on `127.0.0.1:3000`. It is not meant to be exposed to a network. See the [CLI Reference](./CLI.md).
