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
const {
  describeRetrieverContract,
  describeTextRetrieverContract,
} = require("../../utils/retriever-contract");
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

describeTextRetrieverContract(
  "PineconeRetriever (integrated-embedding index)",
  () => make(fakePinecone({ kind: "integrated" })),
  { extended: true },
);

describe("PineconeRetriever on an index that embeds text itself", () => {
  const docs = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: `d${i}`,
      content: `chunk number ${i}`,
    }));

  test("finds the embedded field from the description, not another string field", async () => {
    const fake = fakePinecone({ kind: "integrated" });
    const retriever = make(fake);
    await retriever.store([{ id: "a", content: "Paid vacation." }]);
    expect(upserts(fake)[0].body.documents[0]).toEqual({
      _id: "a",
      chunk_text: "Paid vacation.",
      rag_id: "a",
      rag_content: "Paid vacation.",
      rag_metadata: "{}",
    });
  });

  test("sends the text, not a vector, and ignores a document's vector", async () => {
    const fake = fakePinecone({ kind: "integrated" });
    await make(fake).store([
      { id: "a", vector: [1, 0, 0], content: "Paid vacation." },
    ]);
    const [sent] = upserts(fake)[0].body.documents;
    expect(sent).not.toHaveProperty("values");
    expect(Object.values(sent)).not.toContainEqual([1, 0, 0]);
  });

  test("searches by the query text with an embed clause", async () => {
    const fake = fakePinecone({ kind: "integrated" });
    const retriever = make(fake);
    await retriever.store([{ id: "a", content: "Paid vacation." }]);
    const results = await retriever.retrieve({
      query: "vacation",
      queryVector: [0.1, 0.2],
      topK: 2,
    });
    expect(results.map((r) => r.id)).toEqual(["a"]);
    const search = fake.calls.find((c) => c.url.endsWith("/documents/search"));
    expect(search.body).toEqual({
      score_by: [{ type: "embed", fields: ["chunk_text"], query: "vacation" }],
      top_k: 2,
      include_fields: ["rag_id", "rag_content", "rag_metadata"],
    });
    // The text alone works too
    await expect(retriever.retrieve("vacation", 1)).resolves.toHaveLength(1);
  });

  test("a missing or empty query says the index needs the query text", async () => {
    const fake = fakePinecone({ kind: "integrated" });
    const retriever = make(fake);
    for (const request of [
      { queryVector: [1, 0, 0, 0] },
      [1, 0, 0, 0],
      { query: "  " },
      {},
    ]) {
      await expect(retriever.retrieve(request)).rejects.toThrow(
        /embeds text itself \(integrated embedding, field chunk_text\), so it needs the query text/,
      );
    }
    expect(
      fake.calls.filter((c) => c.url.endsWith("/documents/search")),
    ).toHaveLength(0);
  });

  test("a document without content is refused before anything is sent", async () => {
    const fake = fakePinecone({ kind: "integrated" });
    await expect(
      make(fake).store([
        { id: "a", content: "ok" },
        { id: "b", vector: [1, 0, 0, 0] },
      ]),
    ).rejects.toThrow(/document "b" has no content for Pinecone to embed/);
    expect(upserts(fake)).toHaveLength(0);
  });

  test("upserts at most 96 documents a request", async () => {
    const fake = fakePinecone({ kind: "integrated" });
    const retriever = make(fake);
    await retriever.store(docs(200));
    expect(upserts(fake).map((c) => c.body.documents.length)).toEqual([
      96, 96, 8,
    ]);
    expect(await retriever.size()).toBe(200);
  });

  test("keeps each upsert under 2 MB", async () => {
    const fake = fakePinecone({ kind: "integrated" });
    const big = "word ".repeat(100000); // about 500 KB
    await make(fake).store(
      Array.from({ length: 5 }, (_, i) => ({ id: `big${i}`, content: big })),
    );
    const sizes = upserts(fake).map((c) => c.body.documents.length);
    expect(sizes.length).toBeGreaterThan(1);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(5);
    for (const call of upserts(fake)) {
      expect(JSON.stringify(call.body).length).toBeLessThan(2000000);
    }
  });

  test("waits for its own writes to be indexed before reading", async () => {
    const fake = fakePinecone({ kind: "integrated" });
    const retriever = make(fake);
    await retriever.store([{ id: "a", content: "paid vacation" }]);
    await retriever.store([{ id: "b", content: "remote work" }]);
    const [top] = await retriever.retrieve({ query: "remote work", topK: 1 });
    expect(top).toMatchObject({ id: "b", content: "remote work" });
  });

  test("textField skips the description; it must be a field the index embeds", async () => {
    const fake = fakePinecone({ kind: "integrated" });
    const retriever = make(fake, { textField: "chunk_text" });
    await retriever.store([{ id: "a", content: "Paid vacation." }]);
    await retriever.retrieve({ query: "vacation", topK: 1 });
    expect(
      fake.calls.some((c) => c.url.startsWith("https://api.pinecone.io/")),
    ).toBe(false);

    const byName = fakePinecone({ kind: "integrated" });
    const wrong = new PineconeRetriever({
      apiKey: byName.apiKey,
      index: byName.indexName,
      fetch: byName.fetch,
      textField: "title",
    });
    await expect(wrong.store([{ id: "a", content: "x" }])).rejects.toThrow(
      /no text field named "title" that it embeds/,
    );
    expect(
      () =>
        new PineconeRetriever({
          apiKey: "k",
          host: "h",
          textField: "t",
          vectorField: "v",
        }),
    ).toThrow(/not both/);
    expect(
      () =>
        new PineconeRetriever({
          apiKey: "k",
          host: "h",
          textField: "t",
          api: "vectors",
        }),
    ).toThrow(/needs a document index/);
  });

  test("a pipeline with no embedder retrieves by the query text", async () => {
    const { createRagPipeline } = require("../../../src/core/create-pipeline");
    const fake = fakePinecone({ kind: "integrated" });
    const retriever = make(fake);
    await retriever.store([
      { id: "a", content: "Employees get twenty days of paid vacation." },
      { id: "b", content: "Remote work from home three times a week." },
    ]);
    const pipeline = createRagPipeline({
      retriever,
      llm: { generate: async (q, ctx) => `${ctx.length}:${ctx[0].id}` },
    });
    const result = await pipeline.run({
      query: "How much paid vacation?",
      options: { topK: 1 },
    });
    expect(result.success).toBe(true);
    expect(result.results.map((d) => d.id)).toEqual(["a"]);
  });
});

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

  test("an index with neither a dense_vector field nor a text field it embeds is refused", async () => {
    const fake = fakePinecone({ kind: "documents" });
    await expect(
      make(fake, { vectorField: "nope" }).store([
        { id: "a", vector: [1, 0, 0, 0] },
      ]),
    ).rejects.toThrow(/no dense_vector field named "nope"/);
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
