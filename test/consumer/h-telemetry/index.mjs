// Journey H: OpenTelemetry, per the Observability docs.
//
// The docs show `new NodeSDK({ spanProcessors: [...] }).start()` (with
// Langfuse's processor) and say events go to the global LoggerProvider of
// @opentelemetry/sdk-logs 3, "so configure a log exporter". A developer
// without a tracing account uses the SDK's in-memory exporters.
//
// The span exporter's package depends on the OpenTelemetry line the
// developer installs: @opentelemetry/sdk-trace-base (2.x, the long-standing
// home of InMemorySpanExporter) or @opentelemetry/sdk-trace (3.x). The
// harness runs both (TRACE_PKG). With USE_API_LOGS=1 the run passes
// `telemetry: { logs }` from @opentelemetry/api-logs, the docs' option for
// SDKs before sdk-logs 3.
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  InMemoryLogRecordExporter,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";

const { InMemorySpanExporter, SimpleSpanProcessor } = await import(
  process.env.TRACE_PKG || "@opentelemetry/sdk-trace-base"
);
const telemetry =
  process.env.USE_API_LOGS === "1"
    ? { logs: await import("@opentelemetry/api-logs") }
    : true;
import {
  createRagPipeline,
  evaluationScores,
  toLangfuseScores,
  LocalEmbedder,
  MemoryRetriever,
  AnthropicConnector,
} from "@devilsdev/rag-pipeline-utils";

const spans = new InMemorySpanExporter();
const logs = new InMemoryLogRecordExporter();
// The span processor takes the exporter in sdk-trace-base 2.x and
// { exporter } in sdk-trace 3; the log processor takes { exporter } in both
// sdk-logs 0.2xx and 3.
const otel3 = process.env.OTEL3 === "1";
const spanProcessor = new SimpleSpanProcessor(
  otel3 ? { exporter: spans } : spans,
);
const logProcessor = new SimpleLogRecordProcessor({ exporter: logs });
const sdk = new NodeSDK({
  spanProcessors: [spanProcessor],
  logRecordProcessors: [logProcessor],
});
sdk.start();

const docs = [
  {
    id: "vacation",
    content:
      "Full-time employees receive twenty days of paid vacation per year.",
  },
  {
    id: "remote",
    content: "Remote work is allowed two days per week with manager approval.",
  },
];
const embedder = new LocalEmbedder();
embedder.train(docs.map((d) => d.content));
const retriever = new MemoryRetriever();
await retriever.store(
  docs.map((d) => ({ ...d, vector: embedder.embed(d.content) })),
);
const llm = new AnthropicConnector({
  model: "claude-haiku-5-5",
  maxTokens: 200,
});

const pipeline = createRagPipeline({
  embedder,
  retriever,
  llm,
  telemetry, // true: uses the global tracer provider your SDK registered
});
const result = await pipeline.run({
  query: "How many vacation days do I get?",
  options: { evaluate: true, citations: true },
});

// Exports can wait for the SDK's async resource detection: flush first
await spanProcessor.forceFlush();
await logProcessor.forceFlush();

const langfuse = toLangfuseScores(result);
const scores = evaluationScores(result);

const finished = spans.getFinishedSpans();
const records = logs.getFinishedLogRecords();
const events = records.filter(
  (r) =>
    r.eventName === "gen_ai.evaluation.result" ||
    r.attributes?.["event.name"] === "gen_ai.evaluation.result",
);
const spanById = new Map(finished.map((s) => [s.spanContext().spanId, s.name]));

// Which @opentelemetry/api did npm install? (events need 1.10+)
const { readFileSync } = await import("node:fs");
const apiVersion = JSON.parse(
  readFileSync("node_modules/@opentelemetry/api/package.json", "utf8"),
).version;

console.log(finished.map((s) => s.name));
console.log(
  events.map((e) => [
    e.attributes["gen_ai.evaluation.name"],
    e.attributes["gen_ai.evaluation.score.value"],
  ]),
);
console.log(result.telemetry);
console.log(langfuse);

console.log(
  "RESULT " +
    JSON.stringify({
      success: result.success,
      error: result.error ?? null,
      answer: result.answer,
      apiVersion,
      spanNames: finished.map((s) => s.name),
      runAttrs:
        finished.find((s) => s.name === "rag.pipeline.run")?.attributes ?? null,
      chatAttrs:
        finished.find((s) => s.name.startsWith("chat"))?.attributes ?? null,
      logRecords: records.length,
      events: events.map((e) => ({
        name: e.attributes["gen_ai.evaluation.name"],
        value: e.attributes["gen_ai.evaluation.score.value"],
        parent: spanById.get(e.spanContext?.spanId) ?? null,
      })),
      telemetry: result.telemetry ?? null,
      traceIdMatches:
        !!result.telemetry &&
        finished.some(
          (s) => s.spanContext().traceId === result.telemetry.traceId,
        ),
      langfuse,
      scores,
    }),
);

await sdk.shutdown();
