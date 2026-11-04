"use strict";

/**
 * gen_ai.evaluation.result events, through the real OpenTelemetry SDKs: each
 * score is a log record parented to the span of what it judges.
 */

const api = require("@opentelemetry/api");
const logsApi = require("@opentelemetry/api-logs");
const {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} = require("@opentelemetry/sdk-trace-base");
const {
  LoggerProvider,
  InMemoryLogRecordExporter,
  SimpleLogRecordProcessor,
} = require("@opentelemetry/sdk-logs");
const {
  AsyncLocalStorageContextManager,
} = require("@opentelemetry/context-async-hooks");

const { createRagPipeline } = require("../../../src/core/create-pipeline");
const { MemoryRetriever } = require("../../../src/connectors/memory-retriever");
const { HashEmbedder } = require("../../../src/testing");

const spans = new InMemorySpanExporter();
const tracerProvider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(spans)],
});
const records = new InMemoryLogRecordExporter();
const loggerProvider = new LoggerProvider({
  processors: [new SimpleLogRecordProcessor({ exporter: records })],
});

beforeAll(() => {
  api.context.setGlobalContextManager(
    new AsyncLocalStorageContextManager().enable(),
  );
  api.trace.setGlobalTracerProvider(tracerProvider);
  logsApi.logs.setGlobalLoggerProvider(loggerProvider);
});
afterAll(() => {
  api.trace.disable();
  api.context.disable();
  logsApi.logs.disable();
});
afterEach(() => {
  spans.reset();
  records.reset();
});

const TEXT = "Employees get twenty days of paid vacation.";
const QUALITY = { citations: true, evaluate: true };

async function pipeline(extra = {}) {
  const embedder = new HashEmbedder();
  const retriever = new MemoryRetriever();
  await retriever.store([
    { id: "vacation", content: TEXT, vector: await embedder.embed(TEXT) },
  ]);
  return createRagPipeline({
    embedder,
    retriever,
    llm: {
      async generate(query) {
        // Lets concurrent runs interleave
        await new Promise((r) => setTimeout(r, query.length % 7));
        return TEXT;
      },
      async *generateStream() {
        yield TEXT;
      },
    },
    // @opentelemetry/api 1.9 has no logs API: pass api-logs, whose global
    // LoggerProvider the SDK registered
    telemetry: { logs: logsApi },
    ...extra,
  });
}

const spanByName = (name) =>
  spans.getFinishedSpans().filter((s) => s.name === name);
const events = () =>
  records
    .getFinishedLogRecords()
    .filter((r) => r.eventName === "gen_ai.evaluation.result");
const parentOf = (name) =>
  events().find((r) => r.attributes["gen_ai.evaluation.name"] === name)
    .spanContext.spanId;

test("emits one event per score, parented to the stage it judges", async () => {
  const result = await (
    await pipeline()
  ).run({
    query: "How many vacation days?",
    options: QUALITY,
  });
  const [chat] = spanByName("chat");
  const [retrieval] = spanByName("retrieval");
  const [runSpan] = spanByName("rag.pipeline.run");

  expect(events().map((r) => r.attributes["gen_ai.evaluation.name"])).toEqual([
    "faithfulness",
    "relevance",
    "contextPrecision",
    "groundedness",
    "citationCoverage",
  ]);
  expect(parentOf("faithfulness")).toBe(chat.spanContext().spanId);
  expect(parentOf("citationCoverage")).toBe(chat.spanContext().spanId);
  expect(parentOf("contextPrecision")).toBe(retrieval.spanContext().spanId);
  for (const r of events()) {
    expect(r.spanContext.traceId).toBe(runSpan.spanContext().traceId);
    expect(typeof r.attributes["gen_ai.evaluation.score.value"]).toBe("number");
    expect(r.attributes).not.toHaveProperty("gen_ai.evaluation.explanation");
  }

  expect(result.telemetry).toEqual({
    traceId: runSpan.spanContext().traceId,
    spanId: runSpan.spanContext().spanId,
    spans: {
      retrieval: retrieval.spanContext().spanId,
      generation: chat.spanContext().spanId,
    },
  });
});

test("names the retrieval span after the operation, as an internal span", async () => {
  await (await pipeline()).run({ query: "vacation?" });
  const [retrieval] = spanByName("retrieval");
  expect(retrieval.kind).toBe(api.SpanKind.INTERNAL);
});

test("keeps concurrent runs' events on their own spans", async () => {
  const p = await pipeline();
  const queries = ["a?", "bb bb?", "ccc ccc ccc?", "dddd?", "eeeeeeee?"];
  const results = await Promise.all(
    queries.map((query) => p.run({ query, options: QUALITY })),
  );
  const chatIds = new Set(results.map((r) => r.telemetry.spans.generation));
  expect(chatIds.size).toBe(queries.length);
  for (const r of results) {
    const mine = events().filter(
      (e) => e.spanContext.traceId === r.telemetry.traceId,
    );
    expect(mine).toHaveLength(5);
    for (const e of mine) {
      const expected =
        e.attributes["gen_ai.evaluation.name"] === "contextPrecision"
          ? r.telemetry.spans.retrieval
          : r.telemetry.spans.generation;
      expect(e.spanContext.spanId).toBe(expected);
    }
  }
});

test("a streamed run emits on its done chunk, with the stages nested", async () => {
  let done;
  const stream = await (
    await pipeline()
  ).run({
    query: "vacation?",
    options: { ...QUALITY, stream: true },
  });
  for await (const chunk of stream) if (chunk.done) done = chunk;
  const [runSpan] = spanByName("rag.pipeline.run");
  const [chat] = spanByName("chat");
  const parent = (s) =>
    (s.parentSpanContext && s.parentSpanContext.spanId) || s.parentSpanId;
  expect(parent(chat)).toBe(runSpan.spanContext().spanId);
  expect(parent(spanByName("retrieval")[0])).toBe(runSpan.spanContext().spanId);
  expect(done.telemetry.spans.generation).toBe(chat.spanContext().spanId);
  expect(parentOf("faithfulness")).toBe(chat.spanContext().spanId);
});

test("a stage without a span (a cache hit) parents to the run", async () => {
  const p = await pipeline({ cache: true });
  const first = await p.run({ query: "vacation?", options: QUALITY });
  const firstIds = { ...first.telemetry };
  spans.reset();
  records.reset();
  const result = await p.run({ query: "vacation?", options: QUALITY });
  expect(spanByName("retrieval")).toHaveLength(0);
  expect(result.telemetry.spans).not.toHaveProperty("retrieval");
  expect(parentOf("contextPrecision")).toBe(result.telemetry.spanId);
  // A cached run gets its own result: the first caller's ids are unchanged
  expect(first.telemetry).toEqual(firstIds);
  expect(result.telemetry.spanId).not.toBe(firstIds.spanId);
});

test("no quality options, no events", async () => {
  await (await pipeline()).run({ query: "vacation?" });
  expect(events()).toHaveLength(0);
});

test("uses a logger passed in, and the logs API of @opentelemetry/api 1.10", async () => {
  const emitted = [];
  const logger = { emit: (r) => emitted.push(r) };
  await (
    await pipeline({ telemetry: { logger } })
  ).run({
    query: "vacation?",
    options: QUALITY,
  });
  expect(emitted.map((r) => r.eventName)).toEqual(
    Array(5).fill("gen_ai.evaluation.result"),
  );

  const viaApi = [];
  const api110 = {
    ...api,
    logs: { getLogger: () => ({ emit: (r) => viaApi.push(r) }) },
  };
  await (
    await pipeline({ telemetry: { api: api110 } })
  ).run({
    query: "vacation?",
    options: QUALITY,
  });
  expect(viaApi).toHaveLength(5);
});

test("rejects a logger or logs module of the wrong shape", async () => {
  await expect(pipeline({ telemetry: { logger: {} } })).rejects.toThrow(
    "telemetry.logger must be an OpenTelemetry Logger",
  );
  await expect(pipeline({ telemetry: { logs: {} } })).rejects.toThrow(
    "telemetry.logs must be the @opentelemetry/api-logs module",
  );
});

test("without a logs API, runs work and emit nothing", async () => {
  const { createTelemetry } = require("../../../src/observability/otel");
  // @opentelemetry/api 1.9 has no logs API, and api-logs is never loaded
  // unless passed
  expect(createTelemetry(true).logger).toBeNull();
  const result = await (
    await pipeline({ telemetry: true })
  ).run({
    query: "vacation?",
    options: QUALITY,
  });
  expect(result.success).toBe(true);
  expect(result.telemetry.traceId).toMatch(/^[0-9a-f]{32}$/);
  expect(events()).toHaveLength(0);
});
