"use strict";

const { trace, context } = require("@opentelemetry/api");
const {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} = require("@opentelemetry/sdk-trace-base");
const {
  AsyncLocalStorageContextManager,
} = require("@opentelemetry/context-async-hooks");

const {
  createModelRouter,
  classifyQuery,
} = require("../../../src/cost/model-router");
const { createRagPipeline } = require("../../../src/core/create-pipeline");
const { CostTracker } = require("../../../src/cost/cost-tracker");
const { runContractTests, EchoLLM } = require("../../../src/testing");

const DOCS = [
  { id: "vacation", content: "Employees get twenty vacation days per year." },
];
const retriever = { retrieve: async () => DOCS };

/** A fake llm that answers with its name and records its calls. */
function fake(name, { fail, failStream, stream = true, cacheKey } = {}) {
  const llm = {
    calls: [],
    async generate(query, docs, options) {
      llm.calls.push({ method: "generate", options });
      if (fail) throw fail;
      return `${name} answer`;
    },
    ...(cacheKey && { cacheKey }),
  };
  if (stream) {
    llm.generateStream = async function* generateStream(query, docs, options) {
      llm.calls.push({ method: "generateStream", options });
      if (failStream === "before") throw new Error(`${name} down`);
      yield { token: `${name} `, done: false };
      if (failStream === "after") throw new Error(`${name} broke`);
      yield { token: "answer", done: false };
      yield { token: "", done: true };
    };
  }
  return llm;
}

// Per 1000 tokens: haiku is cheaper on input, sonnet on output (made up).
const HAIKU = { input: 0.001, output: 0.005, unit: 1000 };
const SONNET = { input: 0.002, output: 0.01, unit: 1000 };

function twoTier(extra = {}, llms = {}) {
  const haiku = llms.haiku || fake("haiku");
  const sonnet = llms.sonnet || fake("sonnet");
  const router = createModelRouter({
    routes: [
      { model: "claude-haiku-4-5", llm: haiku, handles: ["simple"] },
      { model: "claude-sonnet-5-5", llm: sonnet },
    ],
    ...extra,
  });
  return { router, haiku, sonnet };
}

async function collect(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

beforeEach(() => jest.useRealTimers());

describe("classifyQuery", () => {
  test.each([
    ["How many vacation days do I get?", "simple"],
    ["What is the remote work policy", "simple"],
    ["Why do contractors get fewer days?", "complex"],
    ["Compare the two health plans", "complex"],
    ["How does carry-over work?", "complex"],
    ["What are the pros and cons of the 4-day week?", "complex"],
    ["How many days? And who approves them?", "complex"],
    [`What ${"is the policy ".repeat(10)}`, "complex"],
    ["", "simple"],
  ])("%j is %s", (query, expected) => {
    expect(classifyQuery(query)).toBe(expected);
  });
});

describe("createModelRouter: choosing a model", () => {
  test("simple queries go to the cheap model, complex ones to the capable one", async () => {
    const { router } = twoTier();

    const simple = await router.route("How many vacation days?", DOCS);
    const complex = await router.route("Why is that the policy?", DOCS);

    expect(simple).toMatchObject({
      class: "simple",
      model: "claude-haiku-4-5",
    });
    expect(complex).toMatchObject({
      class: "complex",
      model: "claude-sonnet-5-5",
    });
    expect(simple.estimatedCost).toBeGreaterThan(0);
  });

  test("prices both the prompt and the expected answer, so the ratio decides", async () => {
    // A: cheap input, dear output. B: the reverse.
    const router = createModelRouter({
      routes: [
        { model: "a", llm: fake("a"), pricing: { input: 1, output: 20 } },
        { model: "b", llm: fake("b"), pricing: { input: 5, output: 2 } },
      ],
      countTokens: (text) => text.length,
    });
    const longDocs = [{ content: "x".repeat(2000) }];

    // Big prompt, short answer: input dominates, A wins.
    const short = await router.route("q", longDocs, { maxTokens: 10 });
    // Short prompt, long answer: output dominates, B wins.
    const long = await router.route("q", [], { maxTokens: 5000 });

    expect(short.model).toBe("a");
    expect(long.model).toBe("b");
    // (2000 + 1 + newline + 100 overhead) * 1 + 10 * 20, per 1000 tokens.
    expect(short.estimatedCost).toBeCloseTo((2102 * 1 + 10 * 20) / 1000, 6);
  });

  test("uses expectedOutputTokens without a run maxTokens", async () => {
    const router = createModelRouter({
      routes: [
        { model: "m", llm: fake("m"), pricing: { input: 0, output: 1 } },
      ],
      expectedOutputTokens: 50,
    });
    expect((await router.route("q")).estimatedCost).toBeCloseTo(0.05, 6);
  });

  test("custom (async) classes, and an error when no route handles one", async () => {
    const router = createModelRouter({
      routes: [
        { model: "a", llm: fake("a"), pricing: HAIKU, handles: ["faq"] },
        { model: "b", llm: fake("b"), pricing: SONNET, handles: ["legal"] },
      ],
      classify: async (q) => (q.includes("contract") ? "legal" : q),
    });

    expect((await router.route("about the contract")).model).toBe("b");
    expect((await router.route("faq")).model).toBe("a");
    await expect(router.route("other")).rejects.toThrow(
      'no route handles query class "other"',
    );
  });

  test("ties keep the order the routes were given in", async () => {
    const router = createModelRouter({
      routes: [
        { model: "first", llm: fake("1"), pricing: HAIKU },
        { model: "second", llm: fake("2"), pricing: HAIKU },
      ],
    });
    expect((await router.route("q")).model).toBe("first");
  });

  test("routes report their resolved prices", () => {
    const { router } = twoTier();
    expect(router.routes).toEqual([
      {
        model: "claude-haiku-4-5",
        handles: ["simple"],
        pricing: { input: 0.001, output: 0.005, unit: 1000 },
      },
      {
        model: "claude-sonnet-5-5",
        handles: null,
        pricing: { input: 0.002, output: 0.01, unit: 1000 },
      },
    ]);
  });
});

describe("createModelRouter: configuration errors", () => {
  test("a model with no known price is an error, not free", () => {
    expect(() =>
      createModelRouter({
        routes: [{ model: "my-local-model", llm: fake("x") }],
      }),
    ).toThrow('no price for "my-local-model"');
  });

  test.each([
    [{}, "`routes` must be a non-empty array"],
    [{ routes: [] }, "`routes` must be a non-empty array"],
    [
      { routes: [{ model: "m", pricing: HAIKU }] },
      "must have a generate() method",
    ],
    [{ routes: [{ llm: fake("x"), pricing: HAIKU }] }, "must be a model name"],
    [
      {
        routes: [
          { model: "m", llm: fake("x"), pricing: HAIKU, handles: "simple" },
        ],
      },
      "must be an array of class names",
    ],
    [
      {
        routes: [{ model: "m", llm: fake("x"), pricing: HAIKU }],
        classify: "x",
      },
      "`classify` must be a function",
    ],
  ])("%j", (options, message) => {
    expect(() => createModelRouter(options)).toThrow(message);
  });
});

describe("createModelRouter: generating", () => {
  test("works on its own, without a pipeline", async () => {
    const { router, haiku } = twoTier();
    expect(
      await router.generate("How many days?", DOCS, { temperature: 0 }),
    ).toBe("haiku answer");
    // The routing decision is not passed on to the model.
    expect(haiku.calls[0].options).toEqual({ temperature: 0 });
  });

  test("emulates a stream for a model that can only generate", async () => {
    const { router } = twoTier({}, { haiku: fake("haiku", { stream: false }) });
    const chunks = await collect(router.generateStream("How many days?", DOCS));
    expect(chunks).toEqual([
      { token: "haiku answer", done: false },
      { token: "", done: true },
    ]);
  });

  test("without fallback, a failing model fails the call", async () => {
    const { router } = twoTier(
      {},
      { haiku: fake("haiku", { fail: new Error("haiku down") }) },
    );
    await expect(router.generate("How many days?", DOCS)).rejects.toThrow(
      "haiku down",
    );
  });

  test("with fallback, the next cheapest route answers and the decision says so", async () => {
    const { router, sonnet } = twoTier(
      { fallback: true },
      { haiku: fake("haiku", { fail: new Error("haiku down") }) },
    );
    const decision = await router.route("How many days?", DOCS);

    const answer = await router.generate("How many days?", DOCS, {
      route: decision,
    });

    expect(answer).toBe("sonnet answer");
    expect(sonnet.calls).toHaveLength(1);
    expect(decision).toMatchObject({
      class: "simple",
      model: "claude-sonnet-5-5",
      fallbackFrom: ["claude-haiku-4-5"],
    });
  });

  test("never falls back on an abort", async () => {
    const abort = new Error("Execution aborted");
    abort.name = "AbortError";
    const { router, sonnet } = twoTier(
      { fallback: true },
      { haiku: fake("haiku", { fail: abort }) },
    );
    await expect(router.generate("How many days?", DOCS)).rejects.toBe(abort);
    expect(sonnet.calls).toHaveLength(0);
  });

  test("a stream falls back before its first token, not after", async () => {
    const before = twoTier(
      { fallback: true },
      { haiku: fake("haiku", { failStream: "before" }) },
    );
    const chunks = await collect(
      before.router.generateStream("How many days?", DOCS),
    );
    expect(chunks.map((c) => c.token).join("")).toBe("sonnet answer");

    const after = twoTier(
      { fallback: true },
      { haiku: fake("haiku", { failStream: "after" }) },
    );
    await expect(
      collect(after.router.generateStream("How many days?", DOCS)),
    ).rejects.toThrow("haiku broke");
    expect(after.sonnet.calls).toHaveLength(0);
  });
});

describe("createModelRouter in createRagPipeline", () => {
  test("result.route reports the decision, and the chosen model answers", async () => {
    const { router, sonnet } = twoTier();
    const pipeline = createRagPipeline({ retriever, llm: router });

    const result = await pipeline.run({ query: "Why twenty days?" });

    expect(result.answer).toBe("sonnet answer");
    expect(result.route).toEqual({
      class: "complex",
      model: "claude-sonnet-5-5",
      estimatedCost: expect.any(Number),
    });
    expect(sonnet.calls[0].options).not.toHaveProperty("route");
  });

  test("the stream's done chunk carries the decision, with or without citations", async () => {
    const { router } = twoTier();
    const pipeline = createRagPipeline({ retriever, llm: router });

    for (const citations of [false, true]) {
      const chunks = await collect(
        await pipeline.run({
          query: "How many days?",
          options: { stream: true, citations },
        }),
      );
      expect(chunks.at(-1).route).toMatchObject({ model: "claude-haiku-4-5" });
    }
  });

  test("a fallback shows in result.route", async () => {
    const { router } = twoTier(
      { fallback: true },
      { haiku: fake("haiku", { fail: new Error("down") }) },
    );
    const pipeline = createRagPipeline({ retriever, llm: router });

    const result = await pipeline.run({ query: "How many days?" });

    expect(result.answer).toBe("sonnet answer");
    expect(result.route).toMatchObject({
      model: "claude-sonnet-5-5",
      fallbackFrom: ["claude-haiku-4-5"],
    });
  });

  test("a query class no route handles fails the run", async () => {
    const router = createModelRouter({
      routes: [
        { model: "a", llm: fake("a"), pricing: HAIKU, handles: ["simple"] },
      ],
    });
    const pipeline = createRagPipeline({ retriever, llm: router });

    const result = await pipeline.run({ query: "Why?" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch('no route handles query class "complex"');
  });

  test("routes see the packed documents", async () => {
    const seen = [];
    const router = createModelRouter({
      routes: [{ model: "a", llm: fake("a"), pricing: HAIKU }],
      classify: (q, docs) => {
        seen.push(docs.length);
        return "any";
      },
    });
    const pipeline = createRagPipeline({
      retriever: {
        retrieve: async () => [...DOCS, { id: "b", content: "y ".repeat(500) }],
      },
      llm: router,
    });

    await pipeline.run({ query: "q", options: { maxContextTokens: 40 } });

    expect(seen).toEqual([1]);
  });

  test("a cached answer has no route: no model was called", async () => {
    const { router } = twoTier(
      {},
      {
        haiku: fake("haiku", { cacheKey: "h" }),
        sonnet: fake("sonnet", { cacheKey: "s" }),
      },
    );
    const pipeline = createRagPipeline({
      embedder: { embed: async () => [1, 0], cacheKey: "e" },
      retriever: { retrieve: async () => DOCS, cacheKey: "r" },
      llm: router,
      cache: true,
    });

    const first = await pipeline.run({ query: "How many days?" });
    const second = await pipeline.run({ query: "How many days?" });

    expect(first.route).toBeDefined();
    expect(second.cache.generation).toBe("hit");
    expect(second.route).toBeUndefined();
  });
});

describe("createModelRouter cache key", () => {
  const keyed = (name) => fake(name, { cacheKey: name });

  test("combines every route, its price and the classifier", () => {
    const { router } = twoTier({}, { haiku: keyed("h"), sonnet: keyed("s") });
    const key = router.getCacheKey("llm");
    expect(key).toContain("claude-haiku-4-5:simple:0.001/0.005/1000:h");
    expect(key).toContain("claude-sonnet-5-5:*:0.002/0.01/1000:s");
    expect(key).toContain("default");
  });

  test("none when a route has no key, or a custom classifier has no cacheKey", () => {
    expect(
      twoTier({}, { haiku: keyed("h") }).router.getCacheKey("llm"),
    ).toBeNull();

    const custom = { classify: () => "simple" };
    const both = { haiku: keyed("h"), sonnet: keyed("s") };
    expect(twoTier(custom, both).router.getCacheKey("llm")).toBeNull();
    expect(
      twoTier({ ...custom, cacheKey: "v1" }, both).router.getCacheKey("llm"),
    ).toContain("custom:v1");
  });
});

describe("CostTracker with a routed pipeline", () => {
  test("prices the run at the model the router chose", async () => {
    const { router } = twoTier();
    const tracker = new CostTracker({ model: "gpt-4" });
    const pipeline = tracker.wrap(
      createRagPipeline({ retriever, llm: router }),
    );

    const result = await pipeline.run({ query: "How many days?" });

    expect(result.cost.model).toMatch(/haiku/);
  });
});

describe("createModelRouter with telemetry", () => {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  beforeAll(() => {
    context.setGlobalContextManager(
      new AsyncLocalStorageContextManager().enable(),
    );
    trace.setGlobalTracerProvider(provider);
  });
  afterAll(() => {
    trace.disable();
    context.disable();
  });

  test("the chat span names the chosen model; the run span the decision", async () => {
    const { router } = twoTier();
    const pipeline = createRagPipeline({
      retriever,
      llm: router,
      telemetry: true,
    });

    await pipeline.run({ query: "Why twenty days?" });

    const spans = exporter.getFinishedSpans();
    const chat = spans.find((s) => s.name.startsWith("chat"));
    expect(chat.name).toBe("chat claude-sonnet-5-5");
    expect(chat.attributes["rag.route.class"]).toBe("complex");
    const run = spans.find((s) => s.name === "rag.pipeline.run").attributes;
    expect(run).toMatchObject({
      "rag.route.class": "complex",
      "rag.route.model": "claude-sonnet-5-5",
    });
    expect(run["rag.route.estimated_cost"]).toBeGreaterThan(0);
  });
});

runContractTests(
  "llm",
  () =>
    createModelRouter({
      routes: [
        {
          model: "echo-a",
          llm: new EchoLLM(),
          pricing: HAIKU,
          handles: ["simple"],
        },
        { model: "echo-b", llm: new EchoLLM(), pricing: SONNET },
      ],
    }),
  { name: "createModelRouter llm contract" },
);
