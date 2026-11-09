"use strict";

const { createRagPipeline } = require("../../../src/core/create-pipeline");
const { createModelRouter } = require("../../../src/cost/model-router");
const { MemoryRetriever } = require("../../../src/connectors/memory-retriever");
const { PipelineCache } = require("../../../src/cache/pipeline-cache");

function llm(name, config, counter) {
  return {
    ...(config ? { config } : {}),
    getCacheKey: () => `${name}|${JSON.stringify(config || null)}`,
    async generate() {
      counter.n += 1;
      return `${name} answer #${counter.n}`;
    },
  };
}

async function setup(configs) {
  const counter = { n: 0 };
  const retriever = new MemoryRetriever();
  await retriever.store([
    { id: "v", content: "Employees get twenty vacation days.", vector: [1, 0] },
  ]);
  const router = createModelRouter({
    routes: [
      {
        model: "gpt-4o-mini",
        llm: llm("mini", configs[0], counter),
        handles: ["simple"],
      },
      { model: "gpt-4o", llm: llm("big", configs[1], counter) },
    ],
  });
  const pipeline = createRagPipeline({
    embedder: { embed: async () => [1, 0], cacheKey: "emb" },
    retriever,
    llm: router,
    cache: true,
  });
  return { pipeline, counter };
}

describe("generation cache with a model router", () => {
  test("answers from routes sampling above temperature 0 are not cached", async () => {
    const { pipeline, counter } = await setup([
      { temperature: 0.7 },
      { temperature: 0.7 },
    ]);
    await pipeline.run({ query: "How many vacation days?" });
    const second = await pipeline.run({ query: "How many vacation days?" });
    expect(second.cache.generation).toBe("skip");
    expect(counter.n).toBe(2);
  });

  test("a route with an unknown temperature is treated as sampling", async () => {
    const { pipeline, counter } = await setup([undefined, undefined]);
    await pipeline.run({ query: "How many vacation days?" });
    const second = await pipeline.run({ query: "How many vacation days?" });
    expect(second.cache.generation).toBe("skip");
    expect(counter.n).toBe(2);
  });

  test("routes at temperature 0 are still cached", async () => {
    const { pipeline, counter } = await setup([
      { temperature: 0 },
      { temperature: 0 },
    ]);
    await pipeline.run({ query: "How many vacation days?" });
    const second = await pipeline.run({ query: "How many vacation days?" });
    expect(second.cache.generation).toBe("hit");
    expect(counter.n).toBe(1);
  });

  test("a per-run temperature of 0 makes a sampling router cacheable", async () => {
    const { pipeline, counter } = await setup([
      { temperature: 0.7 },
      { temperature: 0.7 },
    ]);
    const options = { temperature: 0 };
    await pipeline.run({ query: "How many vacation days?", options });
    const second = await pipeline.run({
      query: "How many vacation days?",
      options,
    });
    expect(second.cache.generation).toBe("hit");
    expect(counter.n).toBe(1);
  });

  test("generationKey uses the temperature of the chosen route when given", async () => {
    const counter = { n: 0 };
    const router = createModelRouter({
      routes: [
        {
          model: "gpt-4o-mini",
          llm: llm("mini", { temperature: 0 }, counter),
          handles: ["simple"],
        },
        { model: "gpt-4o", llm: llm("big", { temperature: 0.7 }, counter) },
      ],
    });
    const layers = {
      generation: {
        backend: {},
        ttlSeconds: 1,
        hits: 0,
        misses: 0,
        skipped: 0,
      },
    };
    const pc = new PipelineCache(layers, { llm: router });
    const args = { query: "q", docs: [], options: {} };
    expect(pc.generationKey(args)).toBeNull();
    expect(
      pc.generationKey({ ...args, route: { model: "gpt-4o-mini" } }),
    ).toEqual(expect.any(String));
    expect(
      pc.generationKey({ ...args, route: { model: "gpt-4o" } }),
    ).toBeNull();
  });

  test("a run caches answers from a temperature-0 route even when another route samples", async () => {
    const { pipeline, counter } = await setup([
      { temperature: 0 },
      { temperature: 0.7 },
    ]);
    // A simple query goes to gpt-4o-mini (temperature 0): cached
    await pipeline.run({ query: "How many vacation days?" });
    const simple = await pipeline.run({ query: "How many vacation days?" });
    expect(simple.cache.generation).toBe("hit");
    expect(counter.n).toBe(1);

    // A complex one goes to gpt-4o (temperature 0.7): not cached
    const query =
      "Compare the vacation policies across regions and explain the trade-offs between accrual and carry-over in detail, step by step.";
    await pipeline.run({ query });
    const complex = await pipeline.run({ query });
    expect(complex.cache.generation).toBe("skip");
    expect(counter.n).toBe(3);
  });
});
