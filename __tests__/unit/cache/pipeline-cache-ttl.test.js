"use strict";

const { createRagPipeline } = require("../../../src/core/create-pipeline");
const { MemoryRetriever } = require("../../../src/connectors/memory-retriever");
const { MemoryCache } = require("../../../src/cache/memory-cache");

function recording(extra = {}) {
  const sets = [];
  const backend = {
    ...extra,
    async get() {
      return undefined;
    },
    async set(key, value, options) {
      sets.push({ key, options });
    },
  };
  return { backend, sets };
}

async function runWith(cache) {
  const retriever = new MemoryRetriever();
  await retriever.store([
    { id: "v", content: "Employees get twenty vacation days.", vector: [1, 0] },
  ]);
  const pipeline = createRagPipeline({
    embedder: { cacheKey: "e", embed: async () => [1, 0] },
    retriever,
    llm: {
      cacheKey: "l",
      config: { temperature: 0 },
      generate: async () => "a",
    },
    cache,
  });
  await pipeline.run({ query: "q" });
}

describe("cache TTL", () => {
  test("a store's own ttlSeconds is used when the pipeline sets none", async () => {
    const { backend, sets } = recording({ ttlSeconds: 7 });
    await runWith({ generation: backend });
    expect(sets).toHaveLength(1);
    expect(sets[0].options.ttlSeconds ?? backend.ttlSeconds).toBe(7);
    expect(sets[0].options.ttlSeconds).toBeUndefined();
  });

  test("cache.ttlSeconds for the layer wins over the store", async () => {
    const { backend, sets } = recording({ ttlSeconds: 7 });
    await runWith({ generation: backend, ttlSeconds: { generation: 30 } });
    expect(sets[0].options.ttlSeconds).toBe(30);
  });

  test("a store without a ttl gets the layer default", async () => {
    const { backend, sets } = recording();
    await runWith({ generation: backend });
    expect(sets[0].options.ttlSeconds).toBe(24 * 3600);
  });

  test("a MemoryCache with ttlSeconds: 1 expires the generation entry", async () => {
    const store = new MemoryCache({ ttlSeconds: 1 });
    await runWith({ generation: store });
    const entry = [...store._entries.values()][0];
    expect(entry.expiresAt - Date.now()).toBeLessThanOrEqual(1000);
  });
});
