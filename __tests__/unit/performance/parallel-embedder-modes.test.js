"use strict";

const {
  ParallelEmbedder,
} = require("../../../src/core/performance/parallel-processor");
const { LocalEmbedder } = require("../../../src/connectors/local-embedder");

const texts = ["alpha one", "beta two", "gamma three", "delta four", "epsilon"];

describe("ParallelEmbedder modes", () => {
  beforeAll(() => jest.useRealTimers());

  test("works with the built-in single-text LocalEmbedder (auto)", async () => {
    const embedder = new LocalEmbedder();
    embedder.train(texts);
    const parallel = new ParallelEmbedder(embedder, { batchSize: 2 });

    const vectors = await parallel.embedBatch(texts);
    expect(vectors).toHaveLength(texts.length);
    texts.forEach((t, i) => expect(vectors[i]).toEqual(embedder.embed(t)));
  });

  test("auto uses embedBatch(texts) when the embedder has it", async () => {
    const embedder = {
      embedBatch: jest.fn(async (batch) => batch.map((t) => [t.length])),
      embed: jest.fn(),
    };
    const vectors = await new ParallelEmbedder(embedder, {
      batchSize: 2,
    }).embedBatch(texts);
    expect(vectors).toEqual(texts.map((t) => [t.length]));
    expect(embedder.embedBatch).toHaveBeenCalledTimes(3);
    expect(embedder.embed).not.toHaveBeenCalled();
  });

  test("auto keeps calling embed(texts) for custom embedders, as before", async () => {
    const embedder = {
      embed: jest.fn(async (batch) => batch.map((t) => [t.length])),
    };
    await new ParallelEmbedder(embedder, { batchSize: 5 }).embedBatch(texts);
    expect(embedder.embed).toHaveBeenCalledWith(texts);
  });

  test("single calls embed(text) for each text, in order", async () => {
    const seen = [];
    const embedder = {
      embed: async (text) => {
        seen.push(text);
        return [text.length];
      },
    };
    const vectors = await new ParallelEmbedder(embedder, {
      mode: "single",
      batchSize: 2,
      maxConcurrency: 1,
    }).embedBatch(texts);
    expect(seen).toEqual(texts);
    expect(vectors).toEqual(texts.map((t) => [t.length]));
  });

  test("rejects an unknown mode", () => {
    expect(() => new ParallelEmbedder({}, { mode: "parallel" })).toThrow(
      /Invalid mode "parallel"/,
    );
  });
});
