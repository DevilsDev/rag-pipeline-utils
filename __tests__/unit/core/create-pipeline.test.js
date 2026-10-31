/**
 * Regression tests for createRagPipeline wiring: query embedding, citations on
 * empty retrieval, timeout cleanup, shared plugin registry and hybrid retrieval.
 */

const { createRagPipeline } = require("../../../src/core/create-pipeline");
const pluginRegistry = require("../../../src/core/plugin-registry");
const { MemoryRetriever } = require("../../../src/connectors/memory-retriever");
const { BM25Search } = require("../../../src/retrieval/bm25-search");
const { HybridRetriever } = require("../../../src/retrieval/hybrid-retriever");

const DOCS = [
  {
    id: "vacation",
    vector: [1, 0, 0],
    content: "Employees receive twenty days of paid vacation per year.",
  },
  {
    id: "remote",
    vector: [0, 1, 0],
    content: "Remote work is allowed two days per week.",
  },
];

async function makeRetriever() {
  const retriever = new MemoryRetriever();
  await retriever.store(DOCS);
  return retriever;
}

const echoLlm = {
  async generate(query, docs) {
    return docs.length ? docs[0].content : "I could not find an answer.";
  },
};

describe("createRagPipeline", () => {
  beforeAll(() => jest.useRealTimers());

  test("embeds the query and passes the vector to the retriever", async () => {
    const embedder = { embedQuery: jest.fn(async () => [1, 0, 0]) };
    const pipeline = createRagPipeline({
      embedder,
      retriever: await makeRetriever(),
      llm: echoLlm,
    });

    const result = await pipeline.run({
      query: "How much vacation do I get?",
      options: { citations: true, evaluate: true },
    });

    expect(result.success).toBe(true);
    expect(embedder.embedQuery).toHaveBeenCalledWith(
      "How much vacation do I get?",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.results[0].id).toBe("vacation");
    expect(typeof result.citations.groundednessScore).toBe("number");
    expect(result.evaluation).toBeDefined();
  });

  test.each([
    ["a flat vector", [1, 0, 0]],
    ["a list of vectors", [[1, 0, 0]]],
    ["contract-style { values } objects", [{ id: "q", values: [1, 0, 0] }]],
  ])("accepts embed() returning %s", async (_label, embedding) => {
    const pipeline = createRagPipeline({
      embedder: { embed: async () => embedding },
      retriever: await makeRetriever(),
      llm: echoLlm,
    });

    const result = await pipeline.run({ query: "vacation" });

    expect(result.success).toBe(true);
    expect(result.results[0].id).toBe("vacation");
  });

  test("uses a caller-supplied queryVector without re-embedding", async () => {
    const embedder = { embedQuery: jest.fn() };
    const pipeline = createRagPipeline({
      embedder,
      retriever: await makeRetriever(),
      llm: echoLlm,
    });

    const result = await pipeline.run({
      query: "remote",
      queryVector: [0, 1, 0],
    });

    expect(embedder.embedQuery).not.toHaveBeenCalled();
    expect(result.results[0].id).toBe("remote");
  });

  test("explains a missing embedder instead of crashing in cosine similarity", async () => {
    const pipeline = createRagPipeline({
      retriever: await makeRetriever(),
      llm: echoLlm,
    });

    const result = await pipeline.run({ query: "vacation" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/queryVector is required.*embedder/);
  });

  test("citations succeed with zero retrieved documents", async () => {
    const pipeline = createRagPipeline({ llm: echoLlm });

    const result = await pipeline.run({
      query: "anything",
      options: { citations: true },
    });

    expect(result.success).toBe(true);
    expect(result.answer).toBe("I could not find an answer.");
    expect(result.citations.groundednessScore).toBe(0);
  });

  test("clears the timeout timer when the run finishes first", async () => {
    const clearSpy = jest.spyOn(global, "clearTimeout");
    const pipeline = createRagPipeline({ llm: echoLlm });

    const result = await pipeline.run({
      query: "q",
      options: { timeout: 60000 },
    });

    expect(result.success).toBe(true);
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  test("still reports a timeout when the run is too slow", async () => {
    const slowLlm = {
      generate: () => new Promise((r) => setTimeout(() => r("late"), 200)),
    };
    const pipeline = createRagPipeline({ llm: slowLlm });

    const result = await pipeline.run({
      query: "q",
      options: { timeout: 20 },
    });

    expect(result).toEqual({ success: false, error: "Execution timeout" });
  });

  test("stream mode uses generateStream when the LLM provides it", async () => {
    async function* tokens() {
      yield { token: "a", done: false };
      yield { token: "", done: true };
    }
    const pipeline = createRagPipeline({
      llm: { generateStream: () => tokens() },
    });

    const stream = await pipeline.run({
      query: "q",
      options: { stream: true },
    });
    const received = [];
    for await (const chunk of stream) received.push(chunk.token);

    expect(received).toEqual(["a", ""]);
  });

  test("stream mode falls back to generate() as a single chunk", async () => {
    const pipeline = createRagPipeline({ llm: echoLlm });

    const stream = await pipeline.run({
      query: "q",
      options: { stream: true },
    });
    const received = [];
    for await (const chunk of stream) received.push(chunk);

    expect(received).toEqual([
      { token: "I could not find an answer.", done: false },
      { token: "", done: true, timing: expect.any(Object) },
    ]);
  });

  test("applies the reranker to retrieved documents", async () => {
    const reranker = {
      rerank: jest.fn(async (_q, docs) => [...docs].reverse()),
    };
    const pipeline = createRagPipeline({
      retriever: { retrieve: async () => [{ id: "a" }, { id: "b" }] },
      reranker,
      llm: echoLlm,
    });

    const result = await pipeline.run({ query: "q" });

    expect(result.results.map((d) => d.id)).toEqual(["b", "a"]);
  });

  test("resolves plugins registered on the exported pluginRegistry", async () => {
    const retriever = {
      metadata: {
        name: "regression-retriever",
        version: "1.0.0",
        type: "retriever",
      },
      store: async () => {},
      retrieve: async () => [{ id: "from-registry", content: "registered" }],
    };
    await pluginRegistry.register(
      "retriever",
      "regression-retriever",
      retriever,
    );

    const pipeline = createRagPipeline({
      retriever: "regression-retriever",
      llm: echoLlm,
    });
    const result = await pipeline.run({ query: "q" });

    expect(result.success).toBe(true);
    expect(result.results[0].id).toBe("from-registry");
  });
});

describe("HybridRetriever with vector and BM25 retrievers", () => {
  test("vector retriever receives queryVector and contributes results", async () => {
    const bm25 = new BM25Search();
    bm25.index([
      { id: "remote", content: DOCS[1].content },
      { id: "other", content: "Vacation requests go through the HR portal." },
    ]);
    const hybrid = new HybridRetriever([
      { retriever: await makeRetriever(), name: "vector" },
      { retriever: bm25, name: "bm25" },
    ]);
    const onError = jest.fn();
    hybrid.on("retrieverError", onError);

    const results = await hybrid.retrieve({
      query: "vacation",
      queryVector: [1, 0, 0],
      topK: 5,
    });

    expect(onError).not.toHaveBeenCalled();
    expect(results.map((r) => r.id)).toContain("vacation");
  });

  test("throws when every retriever fails instead of returning nothing", async () => {
    const hybrid = new HybridRetriever([
      {
        retriever: {
          retrieve: async () => {
            throw new Error("down");
          },
        },
        name: "broken",
      },
    ]);

    await expect(hybrid.retrieve({ query: "q" })).rejects.toThrow(
      /all retrievers failed \(down\)/,
    );
  });
});
