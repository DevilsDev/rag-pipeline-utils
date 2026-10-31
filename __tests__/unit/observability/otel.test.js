"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { trace, context, SpanStatusCode } = require("@opentelemetry/api");
const {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} = require("@opentelemetry/sdk-trace-base");
const {
  AsyncLocalStorageContextManager,
} = require("@opentelemetry/context-async-hooks");

const { createRagPipeline } = require("../../../src/core/create-pipeline");
const { MemoryRetriever } = require("../../../src/connectors/memory-retriever");
const {
  AnthropicConnector,
} = require("../../../src/connectors/anthropic-connector");
const { HashEmbedder, EchoLLM, fixtures } = require("../../../src/testing");

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
const contextManager = new AsyncLocalStorageContextManager();

beforeAll(() => {
  context.setGlobalContextManager(contextManager.enable());
  trace.setGlobalTracerProvider(provider);
});
afterAll(() => {
  trace.disable();
  context.disable();
});
afterEach(() => exporter.reset());

const QUERY = "How many vacation days do employees get?";

async function indexedRetriever(embedder) {
  const retriever = new MemoryRetriever();
  await retriever.store(
    await Promise.all(
      fixtures.documents.map(async (d) => ({
        ...d,
        vector: await embedder.embed(d.content),
      })),
    ),
  );
  return retriever;
}

async function pipeline(extra = {}) {
  const embedder = new HashEmbedder();
  return createRagPipeline({
    embedder,
    retriever: await indexedRetriever(embedder),
    llm: new EchoLLM(),
    telemetry: true,
    ...extra,
  });
}

const spans = () => exporter.getFinishedSpans();
const byName = (name) => spans().find((s) => s.name === name);
const parentId = (span) =>
  span.parentSpanContext ? span.parentSpanContext.spanId : undefined;

describe("createRagPipeline({ telemetry })", () => {
  test("a run span with a child span per stage, under the caller's span", async () => {
    const p = await pipeline();
    const tracer = trace.getTracer("app");
    await tracer.startActiveSpan("POST /ask", async (request) => {
      const result = await p.run({ query: QUERY });
      expect(result.success).toBe(true);
      request.end();
    });

    const names = spans().map((s) => s.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "POST /ask",
        "rag.pipeline.run",
        "embeddings",
        "retrieval",
        "chat",
      ]),
    );
    const run = byName("rag.pipeline.run");
    expect(parentId(run)).toBe(byName("POST /ask").spanContext().spanId);
    for (const stage of ["embeddings", "retrieval", "chat"]) {
      expect(parentId(byName(stage))).toBe(run.spanContext().spanId);
    }
    expect(byName("retrieval").attributes).toMatchObject({
      "gen_ai.operation.name": "retrieval",
      "gen_ai.retrieval.top_k": 3,
      "rag.retrieval.result_count": 3,
    });
    expect(byName("embeddings").attributes).toMatchObject({
      "gen_ai.operation.name": "embeddings",
      "gen_ai.embeddings.dimension.count": 256,
    });
    expect(run.attributes).toMatchObject({
      "rag.success": true,
      "rag.result_count": 3,
      "rag.answered": true,
    });
  });

  test("records no query text or documents unless recordContent is set", async () => {
    await (await pipeline()).run({ query: QUERY });
    const everything = JSON.stringify(spans().map((s) => s.attributes));
    expect(everything).not.toMatch(/vacation/i);

    exporter.reset();
    await (
      await pipeline({ telemetry: { recordContent: true } })
    ).run({ query: QUERY });
    expect(byName("retrieval").attributes["gen_ai.retrieval.query.text"]).toBe(
      QUERY,
    );
    expect(
      JSON.parse(
        byName("retrieval").attributes["gen_ai.retrieval.documents"],
      )[0],
    ).toMatchObject({ id: "vacation" });
    expect(byName("rag.pipeline.run").attributes["rag.query.text"]).toBe(QUERY);
  });

  test("a failing stage: both spans are ERROR, and every span ends", async () => {
    const p = createRagPipeline({
      embedder: new HashEmbedder(),
      retriever: {
        async retrieve() {
          throw new Error("index unavailable");
        },
      },
      telemetry: true,
    });
    const result = await p.run({ query: QUERY });
    expect(result).toMatchObject({
      success: false,
      error: "index unavailable",
    });

    const retrieval = byName("retrieval");
    expect(retrieval.status.code).toBe(SpanStatusCode.ERROR);
    expect(retrieval.events.map((e) => e.name)).toContain("exception");
    const run = byName("rag.pipeline.run");
    expect(run.status).toMatchObject({
      code: SpanStatusCode.ERROR,
      message: "index unavailable",
    });
    expect(
      spans()
        .map((s) => s.name)
        .sort(),
    ).toEqual(["embeddings", "rag.pipeline.run", "retrieval"].sort());
  });

  test("a timeout ends the run span with error.type timeout, and the stage span ends too", async () => {
    const p = createRagPipeline({
      retriever: {
        retrieve({ signal }) {
          return new Promise((resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          });
        },
      },
      telemetry: true,
    });
    const result = await p.run({ query: QUERY, options: { timeout: 30 } });
    expect(result.error).toBe("Execution timeout");
    await new Promise((r) => setTimeout(r, 20)); // let the stage settle
    expect(byName("rag.pipeline.run").attributes["error.type"]).toBe("timeout");
    expect(byName("retrieval")).toBeDefined();
  });

  test("a stream: the chat and run spans end when it ends, or when the reader stops early", async () => {
    const p = await pipeline();
    const stream = await p.run({ query: QUERY, options: { stream: true } });
    for await (const chunk of stream) void chunk;
    expect(byName("chat").attributes["gen_ai.request.stream"]).toBe(true);
    expect(byName("rag.pipeline.run")).toBeDefined();

    exporter.reset();
    const early = await p.run({ query: QUERY, options: { stream: true } });
    for await (const chunk of early) {
      void chunk;
      break; // stop after the first chunk
    }
    expect(byName("chat")).toBeDefined();
    expect(byName("rag.pipeline.run")).toBeDefined();
  });

  test("a stream records time to first chunk on the chat span and first token on the run span", async () => {
    const llm = {
      async *generateStream() {
        await new Promise((r) => setTimeout(r, 40));
        yield { token: "Twenty days.", done: false };
        yield { token: "", done: true };
      },
    };
    const p = await pipeline({ llm });
    const stream = await p.run({ query: QUERY, options: { stream: true } });
    let done;
    for await (const chunk of stream) if (chunk.done) done = chunk;

    const first =
      byName("chat").attributes["gen_ai.response.time_to_first_chunk"];
    expect(first).toBeGreaterThanOrEqual(0.035); // seconds
    expect(first).toBeLessThan(5);
    const run = byName("rag.pipeline.run").attributes;
    expect(run["rag.time_to_first_token_ms"]).toBe(done.timing.firstTokenMs);
    expect(run["rag.time_to_first_token_ms"]).toBeGreaterThanOrEqual(35);
  });

  test("a non-streamed run has no first-token attributes", async () => {
    const p = await pipeline();
    await p.run({ query: QUERY });
    expect(byName("rag.pipeline.run").attributes).not.toHaveProperty(
      "rag.time_to_first_token_ms",
    );
  });

  test("names spans after the connector's provider and model", async () => {
    const llm = new AnthropicConnector({ apiKey: "k" });
    jest
      .spyOn(llm.client, "post")
      .mockResolvedValue({ data: { content: [{ text: "Twenty days." }] } });
    const embedder = new HashEmbedder();
    const p = createRagPipeline({
      embedder,
      retriever: await indexedRetriever(embedder),
      llm,
      telemetry: true,
    });
    await p.run({ query: QUERY });
    const chat = byName("chat claude-sonnet-5-5");
    expect(chat.attributes).toMatchObject({
      "gen_ai.operation.name": "chat",
      "gen_ai.provider.name": "anthropic",
      "gen_ai.request.model": "claude-sonnet-5-5",
    });
  });

  test("a cache hit has no stage span, and the run span says so", async () => {
    const p = await pipeline({ cache: true });
    await p.run({ query: QUERY });
    exporter.reset();
    await p.run({ query: QUERY });
    expect(byName("retrieval")).toBeUndefined();
    expect(byName("rag.pipeline.run").attributes["rag.cache.retrieval"]).toBe(
      "hit",
    );
  });

  test("without telemetry nothing is recorded", async () => {
    await (await pipeline({ telemetry: undefined })).run({ query: QUERY });
    expect(spans()).toEqual([]);
  });

  test("a bad option fails at createRagPipeline", () => {
    expect(() => createRagPipeline({ telemetry: "yes" })).toThrow(
      /telemetry must be true/,
    );
    expect(() => createRagPipeline({ telemetry: { tracer: {} } })).toThrow(
      /OpenTelemetry Tracer/,
    );
  });
});

describe("without @opentelemetry/api installed", () => {
  test("telemetry fails at createRagPipeline with an install hint", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "otel-missing-"));
    const hook = path.join(dir, "hook.js");
    fs.writeFileSync(
      hook,
      [
        "const Module = require('module');",
        "const orig = Module._resolveFilename;",
        "Module._resolveFilename = function (request, ...rest) {",
        "  if (request === '@opentelemetry/api') {",
        "    const e = new Error(\"Cannot find module '@opentelemetry/api'\"); e.code = 'MODULE_NOT_FOUND'; throw e;",
        "  }",
        "  return orig.call(this, request, ...rest);",
        "};",
      ].join("\n"),
    );
    const pipelinePath = path.resolve(
      __dirname,
      "../../../src/core/create-pipeline.js",
    );
    const script = `
      const { createRagPipeline } = require(${JSON.stringify(pipelinePath)});
      createRagPipeline({});
      try { createRagPipeline({ telemetry: true }); console.log("no error"); }
      catch (e) { console.log(e.code + " " + e.message); }`;
    const result = spawnSync(process.execPath, ["-r", hook, "-e", script], {
      encoding: "utf8",
    });
    fs.rmSync(dir, { recursive: true, force: true });
    expect(result.stdout.trim()).toMatch(
      /^MISSING_DEPENDENCY .*npm install @opentelemetry\/api/,
    );
  });
});
