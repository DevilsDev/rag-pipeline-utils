"use strict";

/**
 * PineconeRetriever against an in-memory Pinecone (fake-pinecone.js) that
 * is eventually consistent like the real one, as a document index and as
 * a vector index; __tests__/live runs the same contract against real
 * indexes when PINECONE_API_KEY is set.
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

const upserts = (fake) =>
  fake.calls.filter((c) => /\/upsert$/.test(new URL(c.url).pathname));

for (const kind of ["documents", "vectors"]) {
  describeRetrieverContract(
    `PineconeRetriever (${kind} index)`,
    () => make(fakePinecone({ kind })),
    { extended: true },
  );

  describe(`PineconeRetriever on a ${kind} index`, () => {
    test("waits for its own writes to be indexed before reading", async () => {
      const fake = fakePinecone({ kind });
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
    });

    test("without waiting (freshnessTimeoutMs: 0) a read can be stale", async () => {
      const fake = fakePinecone({ kind });
      const retriever = make(fake, { freshnessTimeoutMs: 0 });
      await retriever.store([{ id: "a", vector: [1, 0, 0, 0] }]);
      await retriever.store([{ id: "c", vector: [0, 0, 1, 0] }]);
      const results = await retriever.retrieve({
        queryVector: [0, 0, 1, 0],
        topK: 3,
      });
      expect(results.map((r) => r.id)).not.toContain("c");
    });

    test("keeps metadata flat: nested values travel as JSON", async () => {
      const fake = fakePinecone({ kind });
      const retriever = make(fake);
      const metadata = { source: "a.md", tags: ["x"], nested: { page: 2 } };
      await retriever.store([
        { id: "a", vector: [1, 0, 0, 0], content: "A", metadata },
      ]);
      const { body } = upserts(fake)[0];
      const sent =
        kind === "documents" ? body.documents[0] : body.vectors[0].metadata;
      expect(sent).toMatchObject({
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

    test("ids Pinecone rejects are hashed, and the original kept", async () => {
      const fake = fakePinecone({ kind });
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

    test("checks the index's dimension before sending", async () => {
      const fake = fakePinecone({ kind, dimension: 4 });
      await expect(
        make(fake).store([{ id: "a", vector: [1, 0, 0] }]),
      ).rejects.toThrow(/has 3 dimensions, the index has 4/);
      expect(upserts(fake)).toHaveLength(0);
    });

    test("clear() and reads on a namespace never written are fine", async () => {
      const retriever = make(fakePinecone({ kind }));
      await expect(retriever.clear()).resolves.toBeUndefined();
      await expect(
        retriever.retrieve({ queryVector: [1, 0, 0, 0], topK: 1 }),
      ).resolves.toEqual([]);
      await expect(retriever.list()).resolves.toEqual([]);
    });
  });
}

describe("PineconeRetriever", () => {
  test("reads the index kind from its description: by name, or by host", async () => {
    const byName = fakePinecone({ kind: "documents" });
    const r1 = new PineconeRetriever({
      apiKey: byName.apiKey,
      index: byName.indexName,
      fetch: byName.fetch,
    });
    await r1.store([{ id: "a", vector: [1, 0, 0, 0] }]);
    await r1.retrieve({ queryVector: [1, 0, 0, 0], topK: 1 });
    const control = byName.calls.filter((c) =>
      c.url.startsWith("https://api.pinecone.io/"),
    );
    expect(control.map((c) => c.url)).toEqual([
      `https://api.pinecone.io/indexes/${byName.indexName}`,
    ]);
    expect(upserts(byName)[0].url).toBe(
      `${byName.host}/namespaces/rag_documents/documents/upsert`,
    );

    const byHost = fakePinecone({ kind: "vectors" });
    await make(byHost).store([{ id: "a", vector: [1, 0, 0, 0] }]);
    expect(byHost.calls[0].url).toBe("https://api.pinecone.io/indexes");
    expect(upserts(byHost)[0].url).toBe(`${byHost.host}/vectors/upsert`);
  });

  test("api and vectorField skip the description", async () => {
    const fake = fakePinecone({ kind: "documents" });
    const retriever = make(fake, { api: "documents", vectorField: fake.field });
    await retriever.store([{ id: "a", vector: [1, 0, 0, 0] }]);
    expect(
      fake.calls.some((c) => c.url.startsWith("https://api.pinecone.io/")),
    ).toBe(false);
  });

  test("refuses an index that embeds text itself, saying why", async () => {
    const fake = fakePinecone({ kind: "integrated" });
    await expect(
      make(fake).store([{ id: "a", vector: [1, 0, 0, 0] }]),
    ).rejects.toThrow(/embeds text itself \(integrated embedding\)/);
  });

  test("on a document index, clear() deletes by filter (delete_all has no LSN to wait for)", async () => {
    const fake = fakePinecone({ kind: "documents" });
    const retriever = make(fake);
    await retriever.store([{ id: "a", vector: [1, 0, 0, 0] }]);
    await retriever.clear();
    const del = fake.calls.find((c) => c.url.endsWith("/documents/delete"));
    expect(del.body).toEqual({ filter: { rag_id: { $exists: true } } });
    expect(await retriever.size()).toBe(0);
  });

  test("sends the API key and the API version on every request", async () => {
    const fake = fakePinecone();
    await make(fake).store([{ id: "a", vector: [1, 0, 0, 0] }]);
    for (const call of fake.calls) {
      expect(call.headers).toMatchObject({
        "Api-Key": fake.apiKey,
        "X-Pinecone-Api-Version": "2026-07",
      });
    }
  });

  test("record ids", () => {
    expect(recordId("docs/a.md#0")).toBe("docs/a.md#0");
    expect(recordId("café.md")).toMatch(/^rag-[0-9a-f]{64}$/);
    expect(recordId("x".repeat(513))).toMatch(/^rag-[0-9a-f]{64}$/);
  });

  test("a wrong key says to check PINECONE_API_KEY, without the key", async () => {
    const fake = fakePinecone();
    const retriever = make(fake, { apiKey: "wrong-key-123" });
    const error = await retriever
      .store([{ id: "a", vector: [1, 0, 0, 0] }])
      .catch((e) => e);
    expect(error.message).toMatch(
      /refused the request \(401\); check PINECONE_API_KEY/,
    );
    expect(error.message).not.toMatch(/wrong-key-123/);
  });

  test("needs a key and an index", () => {
    const saved = process.env.PINECONE_API_KEY;
    delete process.env.PINECONE_API_KEY;
    try {
      expect(() => new PineconeRetriever({ host: "h" })).toThrow(/API key/);
      expect(() => new PineconeRetriever({ apiKey: "k" })).toThrow(
        /index \(its name\) or host/,
      );
      expect(
        () => new PineconeRetriever({ apiKey: "k", host: "h", api: "x" }),
      ).toThrow(/api must be/);
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
