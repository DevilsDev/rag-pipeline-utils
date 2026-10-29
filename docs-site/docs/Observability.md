# Observability & Monitoring

**@devilsdev/rag-pipeline-utils** ships small, dependency-free observability helpers: a structured logger, in-process metrics primitives, an execution tracer, a metrics aggregator with an HTML dashboard, and cost tracking. They are all exported from the main entry. There are no `/observability` subpaths, no built-in Prometheus endpoint, no OpenTelemetry exporter and no alerting engine. Feed the data these helpers produce into the monitoring stack you already run.

`createRagPipeline()` does not record metrics or events on its own. You wrap the pipeline (`ExecutionTracer`, `CostTracker`) or record what you need around `run()`.

---

## What is available

| Need                          | Export                                    | Output                                                              |
| ----------------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| Structured logs               | `logger`                                  | JSON lines via pino (pretty output with the optional `pino-pretty`) |
| Counters, gauges, histograms  | `metrics`                                 | In-memory metric objects, JSON export                               |
| Pipeline event history        | `eventLogger`                             | In-memory event list, JSON export                                   |
| Per-run traces                | `ExecutionTracer`, `TraceInspector`       | Trace records, bottleneck and anomaly analysis                      |
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

There is no distributed-tracing exporter. To correlate with OpenTelemetry, start a span around `run()` in your service and log `result.trace.id`.

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
