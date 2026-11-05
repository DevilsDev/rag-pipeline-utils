"use strict";

/**
 * PineconeRetriever against an in-memory Pinecone (fake-pinecone.js) that
 * is eventually consistent like the real one; __tests__/live runs the same
 * contract against a real index when PINECONE_API_KEY is set.
 */

const {
  PineconeRetriever,
  recordId,
} = require("../../../src/retrieval/pinecone-retriever");
const { describeRetrieverContract } = require("../../utils/retriever-contract");
const { fakePinecone } = require("../../utils/fake-pinecone");

const make = (fake, options = {}) =>
  new PineconeRetriever({
    apiKey: fake.apiKey,
    host: fake.host,
    fetch: fake.fetch,
    ...options,
  });

describeRetrieverContract("PineconeRetriever", () => make(fakePinecone()), {
  extended: true,
});

describe("PineconeRetriever", () => {
  test("waits for its own writes to be indexed before reading", async () => {
    const fake = fakePinecone();
    const retriever = make(fake);
    await retriever.store([
      { id: "a", vector: [1, 0, 0, 0], content: "A" },
      { id: "b", vector: [0, 1, 0, 0], content: "B" },
    ]);
    await retriever.store([{ id: "c", vector: [0, 0, 1, 0], content: "C" }]);
    const results = await retriever.retrieve({
      queryVector: [0, 0, 1, 0],
      topK: 3,
    });
    expect(results[0]).toMatchObject({ id: "c", content: "C" });
    expect(
      fake.calls.filter((c) => c.url.endsWith("/query")).length,
    ).toBeGreaterThan(1);
  });

  test("without waiting (freshnessTimeoutMs: 0) a read can be stale", async () => {
    const fake = fakePinecone();
    const retriever = make(fake, { freshnessTimeoutMs: 0 });
    await retriever.store([{ id: "a", vector: [1, 0, 0, 0] }]);
    await retriever.store([{ id: "c", vector: [0, 0, 1, 0] }]);
    const results = await retriever.retrieve({
      queryVector: [0, 0, 1, 0],
      topK: 3,
    });
    expect(results.map((r) => r.id)).not.toContain("c");
  });

  test("resolves the index host from its name, once", async () => {
    const fake = fakePinecone();
    const retriever = new PineconeRetriever({
      apiKey: fake.apiKey,
      index: fake.indexName,
      fetch: fake.fetch,
    });
    await retriever.store([{ id: "a", vector: [1, 0, 0, 0] }]);
    await retriever.retrieve({ queryVector: [1, 0, 0, 0], topK: 1 });
    const control = fake.calls.filter((c) =>
      c.url.startsWith("https://api.pinecone.io/"),
    );
    expect(control).toHaveLength(1);
    expect(control[0].url).toBe(
      `https://api.pinecone.io/indexes/${fake.indexName}`,
    );
  });

  test("sends the API key and the API version on every request", async () => {
    const fake = fakePinecone();
    await make(fake).store([{ id: "a", vector: [1, 0, 0, 0] }]);
    expect(fake.calls[0].headers).toMatchObject({
      "Api-Key": fake.apiKey,
      "X-Pinecone-Api-Version": "2026-07",
    });
  });

  test("keeps metadata flat: nested values travel as JSON", async () => {
    const fake = fakePinecone();
    const retriever = make(fake);
    const metadata = { source: "a.md", tags: ["x"], nested: { page: 2 } };
    await retriever.store([
      { id: "a", vector: [1, 0, 0, 0], content: "A", metadata },
    ]);
    const sent = fake.calls[0].body.vectors[0].metadata;
    expect(sent).toEqual({
      rag_id: "a",
      rag_content: "A",
      rag_metadata: JSON.stringify(metadata),
      rag_source: "a.md",
    });
    const [top] = await retriever.retrieve({
      queryVector: [1, 0, 0, 0],
      topK: 1,
    });
    expect(top.metadata).toEqual(metadata);
  });

  test("ids Pinecone rejects (non-ASCII, over 512) are hashed, and the original kept", async () => {
    expect(recordId("docs/a.md#0")).toBe("docs/a.md#0");
    expect(recordId("café.md")).toMatch(/^rag-[0-9a-f]{64}$/);
    expect(recordId("x".repeat(513))).toMatch(/^rag-[0-9a-f]{64}$/);
    const fake = fakePinecone();
    const retriever = make(fake);
    await retriever.store([{ id: "café.md", vector: [1, 0, 0, 0] }]);
    const [top] = await retriever.retrieve({
      queryVector: [1, 0, 0, 0],
      topK: 1,
    });
    expect(top.id).toBe("café.md");
    await retriever.delete(["café.md"]);
    expect(await retriever.size()).toBe(0);
  });

  test("a wrong key says to check PINECONE_API_KEY, without the key", async () => {
    const fake = fakePinecone();
    const retriever = make(fake, { apiKey: "wrong-key-123" });
    await expect(
      retriever.store([{ id: "a", vector: [1, 0, 0, 0] }]),
    ).rejects.toThrow(/refused the request \(401\); check PINECONE_API_KEY/);
    await expect(
      retriever.store([{ id: "a", vector: [1, 0, 0, 0] }]),
    ).rejects.not.toThrow(/wrong-key-123/);
  });

  test("the index's own dimension error comes through", async () => {
    const fake = fakePinecone({ dimension: 4 });
    await expect(
      make(fake).store([{ id: "a", vector: [1, 0, 0] }]),
    ).rejects.toThrow(
      /dimension 3 does not match the dimension of the index 4/,
    );
  });

  test("clear() on a namespace never written is fine", async () => {
    await expect(make(fakePinecone()).clear()).resolves.toBeUndefined();
  });

  test("needs a key and an index", () => {
    const saved = process.env.PINECONE_API_KEY;
    delete process.env.PINECONE_API_KEY;
    try {
      expect(() => new PineconeRetriever({ host: "h" })).toThrow(/API key/);
      expect(() => new PineconeRetriever({ apiKey: "k" })).toThrow(
        /host .* or index/,
      );
    } finally {
      if (saved !== undefined) process.env.PINECONE_API_KEY = saved;
    }
  });

  test("cache identity only with a cacheKey", () => {
    const fake = fakePinecone();
    expect(make(fake).getCacheKey("retriever")).toBeNull();
    expect(make(fake, { cacheKey: "v1" }).getCacheKey("retriever")).toBe(
      `pinecone|${fake.host}|rag_documents|v1`,
    );
  });

  test(".ragrc.json: the key only from PINECONE_API_KEY, the index from the config or the environment", () => {
    const {
      buildComponents,
    } = require("../../../src/config/component-factory");
    const config = (retriever) => ({
      pipeline: [
        { stage: "embedder", name: "local" },
        { stage: "retriever", name: "pinecone", config: retriever },
      ],
    });
    const saved = {
      key: process.env.PINECONE_API_KEY,
      index: process.env.PINECONE_INDEX,
    };
    process.env.PINECONE_API_KEY = "from-env";
    process.env.PINECONE_INDEX = "env-index";
    try {
      const fromEnv = buildComponents(
        config({ namespace: "n1", apiKey: "ignored" }),
      ).retriever;
      expect(fromEnv._apiKey).toBe("from-env");
      expect(fromEnv.index).toBe("env-index");
      expect(fromEnv.namespace).toBe("n1");
      expect(
        buildComponents(config({ index: "cfg-index" })).retriever.index,
      ).toBe("cfg-index");
    } finally {
      for (const [k, v] of [
        ["PINECONE_API_KEY", saved.key],
        ["PINECONE_INDEX", saved.index],
      ]) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
