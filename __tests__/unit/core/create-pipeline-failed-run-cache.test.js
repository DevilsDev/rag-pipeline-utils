/**
 * A run that fails stores nothing in the cache: the embedding and the
 * retrieval it computed are written only once the run has succeeded.
 */
const { createRagPipeline } = require("../../../src/core/create-pipeline");

function setup({ failFirst = true } = {}) {
  const calls = { retrieve: 0, embed: 0 };
  const retriever = {
    cacheKey: "r1",
    async retrieve() {
      calls.retrieve += 1;
      return [
        { id: "1", content: "Employees get 20 vacation days.", score: 1 },
      ];
    },
  };
  const embedder = {
    cacheKey: "e1",
    async embedQuery() {
      calls.embed += 1;
      return [0.1, 0.2];
    },
  };
  let fail = failFirst;
  const llm = {
    cacheKey: "l1",
    config: { temperature: 0 },
    async generate() {
      if (fail) throw new Error("502 upstream");
      return "ok";
    },
    async *generateStream() {
      if (fail) throw new Error("502 upstream");
      yield { token: "ok", done: false };
      yield { token: "", done: true };
    },
  };
  const pipeline = createRagPipeline({ retriever, embedder, llm, cache: true });
  return { pipeline, calls, heal: () => (fail = false) };
}

test("a failed run leaves retrieval and embeddings uncached", async () => {
  const { pipeline, calls, heal } = setup();
  const failed = await pipeline.run({ query: "q" });
  expect(failed.success).toBe(false);
  heal();
  const retry = await pipeline.run({ query: "q" });
  expect(retry.success).toBe(true);
  expect(retry.cache.retrieval).toBe("miss");
  expect(retry.cache.embeddings).toBe("miss");
  expect(calls).toEqual({ retrieve: 2, embed: 2 });
});

test("a failing stream leaves them uncached too", async () => {
  const { pipeline, calls, heal } = setup();
  const stream = await pipeline.run({ query: "q", options: { stream: true } });
  await expect(
    (async () => {
      for await (const chunk of stream) void chunk;
    })(),
  ).rejects.toThrow("502 upstream");
  heal();
  await pipeline.run({ query: "q" });
  expect(calls).toEqual({ retrieve: 2, embed: 2 });
});

test("a successful run still caches them", async () => {
  const { pipeline, calls } = setup({ failFirst: false });
  await pipeline.run({ query: "q" });
  const second = await pipeline.run({ query: "q" });
  expect(second.cache.retrieval).toBe("hit");
  expect(second.cache.embeddings).toBe("hit");
  expect(calls).toEqual({ retrieve: 1, embed: 1 });
});

test("a completed stream caches them", async () => {
  const { pipeline, calls } = setup({ failFirst: false });
  const chunks = [];
  for await (const c of await pipeline.run({
    query: "q",
    options: { stream: true },
  })) {
    chunks.push(c);
  }
  await pipeline.run({ query: "q" });
  expect(calls).toEqual({ retrieve: 1, embed: 1 });
});
