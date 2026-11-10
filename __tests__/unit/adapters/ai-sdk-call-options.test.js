"use strict";

const { createRagPipeline } = require("../../../src/core/create-pipeline");
const { createAiSdkAdapter } = require("../../../src/adapters/ai-sdk");
const { MemoryRetriever } = require("../../../src/connectors/memory-retriever");

async function pipelineWith(settings = { temperature: 0 }) {
  const retriever = new MemoryRetriever();
  await retriever.store([
    { id: "v", content: "Employees get twenty vacation days.", vector: [1, 0] },
  ]);
  const sent = [];
  const ai = {
    generateText: async (o) => {
      sent.push(o);
      return { text: `answer ${sent.length} penalty=${o.presencePenalty}` };
    },
  };
  const { llm } = createAiSdkAdapter({
    ai,
    languageModel: { modelId: "m", provider: "p" },
    settings,
  });
  const pipeline = createRagPipeline({
    embedder: { cacheKey: "e", embed: async () => [1, 0] },
    retriever,
    llm,
    cache: true,
  });
  return { pipeline, sent };
}

describe("AI SDK adapter call options", () => {
  test("the run's retrieval topK is not sent to the model as a sampling topK", async () => {
    const { pipeline, sent } = await pipelineWith();
    await pipeline.run({ query: "q", options: { topK: 5 } });
    expect(sent[0]).not.toHaveProperty("topK");
  });

  test("a sampling topK set in settings is still sent", async () => {
    const { pipeline, sent } = await pipelineWith({
      temperature: 0,
      topK: 40,
    });
    await pipeline.run({ query: "q", options: { topK: 5 } });
    expect(sent[0].topK).toBe(40);
  });

  test("presencePenalty and frequencyPenalty change the cached answer key", async () => {
    const { pipeline, sent } = await pipelineWith();
    const a = await pipeline.run({
      query: "q",
      options: { presencePenalty: 0 },
    });
    const b = await pipeline.run({
      query: "q",
      options: { presencePenalty: 1.5 },
    });
    const c = await pipeline.run({
      query: "q",
      options: { frequencyPenalty: 1 },
    });
    expect(b.cache.generation).toBe("miss");
    expect(c.cache.generation).toBe("miss");
    expect(sent).toHaveLength(3);
    expect(b.answer).toContain("penalty=1.5");
    expect(a.answer).not.toBe(b.answer);
  });
});
