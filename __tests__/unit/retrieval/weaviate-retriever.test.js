"use strict";

/**
 * WeaviateRetriever against an in-memory Weaviate (fake-weaviate.js), plus
 * the exact requests it sends; __tests__/integration runs the same
 * contract against a real Weaviate in CI.
 */

const {
  WeaviateRetriever,
} = require("../../../src/retrieval/weaviate-retriever");
const { pointId } = require("../../../src/retrieval/qdrant-retriever");
const { describeRetrieverContract } = require("../../utils/retriever-contract");
const { fakeWeaviate } = require("../../utils/fake-weaviate");

const make = (fake, options = {}) =>
  new WeaviateRetriever({ url: fake.url, fetch: fake.fetch, ...options });

describeRetrieverContract(
  "WeaviateRetriever (in-memory Weaviate)",
  () => make(fakeWeaviate()),
  { extended: true },
);

const routes = (fake) =>
  fake.calls.map((c) => `${c.method} ${c.url.replace(fake.url, "")}`);

describe("WeaviateRetriever", () => {
  it("creates the collection with self-provided vectors, then batch-imports", async () => {
    const fake = fakeWeaviate();
    const retriever = make(fake, { url: `${fake.url}//` });
    await retriever.store([
      {
        id: "a.md#0",
        vector: [1, 0, 0],
        content: "A",
        metadata: { source: "a.md", tags: ["x"], nested: { n: 1 } },
      },
    ]);
    expect(routes(fake)).toEqual([
      "GET /v1/schema/RagDocuments",
      "POST /v1/schema",
      "GET /v1/objects?class=RagDocuments&limit=1&include=vector",
      "POST /v1/batch/objects",
    ]);
    const create = fake.calls[1].body;
    expect(create).toMatchObject({
      class: "RagDocuments",
      vectorizer: "none",
      vectorIndexType: "hnsw",
      vectorIndexConfig: { distance: "cosine" },
    });
    const byName = Object.fromEntries(
      create.properties.map((p) => [p.name, p]),
    );
    expect(byName.rag_id).toMatchObject({
      tokenization: "field",
      indexFilterable: true,
    });
    expect(byName.rag_source).toMatchObject({
      tokenization: "field",
      indexFilterable: true,
    });
    expect(byName.rag_metadata).toMatchObject({
      indexFilterable: false,
      indexSearchable: false,
    });
    expect(fake.calls[3].body).toEqual({
      objects: [
        {
          class: "RagDocuments",
          id: pointId("a.md#0"),
          vector: [1, 0, 0],
          properties: {
            rag_id: "a.md#0",
            content: "A",
            rag_source: "a.md",
            rag_metadata: JSON.stringify({
              source: "a.md",
              tags: ["x"],
              nested: { n: 1 },
            }),
          },
        },
      ],
    });
    const [hit] = await retriever.retrieve({ queryVector: [1, 0, 0] });
    expect(hit).toEqual({
      id: "a.md#0",
      score: expect.closeTo(1, 6),
      content: "A",
      metadata: { source: "a.md", tags: ["x"], nested: { n: 1 } },
    });
  });

  it("queries with GraphQL nearVector and converts distance to similarity", async () => {
    const fake = fakeWeaviate();
    const retriever = make(fake, { collection: "docs_v2" });
    expect(retriever.collection).toBe("Docs_v2");
    await retriever.store([
      { id: "a", vector: [1, 0] },
      { id: "b", vector: [0, 1] },
    ]);
    const results = await retriever.retrieve([0.6, 0.8], 2);
    const query = fake.calls[fake.calls.length - 1].body.query;
    expect(query).toBe(
      '{ Get { Docs_v2(nearVector: { vector: [0.6,0.8] }, limit: 2, where: { path: ["rag_id"], operator: Like, valueText: "*" }) { rag_id content rag_metadata _additional { distance } } } }',
    );
    expect(results.map((r) => r.id)).toEqual(["b", "a"]);
    expect(results[0].score).toBeCloseTo(0.8, 6);
    expect(results[1].score).toBeCloseTo(0.6, 6);
  });

  it("treats a missing collection as empty", async () => {
    const fake = fakeWeaviate();
    const retriever = make(fake);
    expect(await retriever.retrieve({ queryVector: [1] })).toEqual([]);
    expect(await retriever.size()).toBe(0);
    expect(await retriever.list()).toEqual([]);
    await retriever.clear();
    await retriever.delete(["a"]);
    await retriever.removeBySource("a.md");
    expect(
      fake.calls.every((c) => c.url.endsWith("/v1/schema/RagDocuments")),
    ).toBe(true);
  });

  it("leaves objects other clients wrote alone", async () => {
    const fake = fakeWeaviate();
    const retriever = make(fake);
    await retriever.store([{ id: "ours", vector: [1, 0], content: "x" }]);
    fake.addForeign(
      "RagDocuments",
      "00000000-0000-4000-8000-000000000000",
      [1, 0],
      { title: "theirs" },
    );
    expect(await retriever.size()).toBe(1);
    expect((await retriever.list()).map((d) => d.id)).toEqual(["ours"]);
    expect(
      (await retriever.retrieve({ queryVector: [1, 0] })).map((r) => r.id),
    ).toEqual(["ours"]);
    await retriever.clear();
    expect(fake.classes.get("RagDocuments").objects.size).toBe(1);
  });

  it("deletes by id and by exact source, in rounds past the server limit", async () => {
    const fake = fakeWeaviate({ maxResults: 2 });
    const retriever = make(fake);
    const docs = Array.from({ length: 5 }, (_, i) => ({
      id: `docs/a.md#${i}`,
      vector: [1, i],
      metadata: { source: "docs/a.md" },
    }));
    await retriever.store([
      ...docs,
      { id: "docs/a.md.bak#0", vector: [1, 0], metadata: { source: "a" } },
      { id: "keep", vector: [0, 1], metadata: { source: "docs/b.md" } },
    ]);
    await retriever.delete(["docs/a.md#0", "missing"]);
    expect(fake.calls[fake.calls.length - 1].body).toEqual({
      match: {
        class: "RagDocuments",
        where: {
          path: ["rag_id"],
          operator: "ContainsAny",
          valueTextArray: ["docs/a.md#0", "missing"],
        },
      },
      output: "minimal",
    });
    expect(await retriever.size()).toBe(6);
    const before = fake.calls.length;
    await retriever.removeBySource("docs/a.md");
    // 4 matching objects, 2 per call: two rounds.
    expect(
      fake.calls.slice(before).filter((c) => c.method === "DELETE"),
    ).toHaveLength(2);
    expect((await retriever.list()).map((d) => d.id).sort()).toEqual([
      "docs/a.md.bak#0",
      "keep",
    ]);
  });

  it("pages through list() with the cursor and honours limit", async () => {
    const fake = fakeWeaviate();
    const retriever = make(fake);
    const docs = Array.from({ length: 300 }, (_, i) => ({
      id: `d${i}`,
      vector: [1, i],
    }));
    await retriever.store(docs);
    const all = await retriever.list();
    expect(all).toHaveLength(300);
    const lists = fake.calls.filter((c) =>
      c.url.includes("/v1/objects?class=RagDocuments&limit=256"),
    );
    expect(lists).toHaveLength(2);
    expect(lists[0].url).toMatch(/&after=$/);
    expect(lists[1].url).toMatch(/&after=[0-9a-f-]{36}$/);
    expect(await retriever.list({ limit: 10 })).toHaveLength(10);
  });

  it("learns the vector size of an existing collection", async () => {
    const fake = fakeWeaviate();
    await make(fake).store([{ id: "a", vector: [1, 0, 0, 0] }]);
    const later = make(fake);
    await expect(later.store([{ id: "b", vector: [1, 0] }])).rejects.toThrow(
      "the documents have 2 dimensions, the collection has 4",
    );
  });

  it("reports Weaviate's per-object batch errors", async () => {
    const fake = fakeWeaviate();
    await make(fake).store([{ id: "a", vector: [1, 0, 0, 0] }]);
    // createCollection: false skips the schema calls, and dimensions: 3
    // the size lookup, so the import reaches Weaviate and fails there.
    const r = make(fake, { createCollection: false, dimensions: 3 });
    await expect(r.store([{ id: "b", vector: [1, 0, 0] }])).rejects.toThrow(
      'document "b" has the wrong vector dimensions: insert to vector index: new node has a vector with length 3',
    );
  });

  it("adds missing properties to a collection made elsewhere", async () => {
    const fake = fakeWeaviate();
    fake.classes.set("Notes", {
      schema: { class: "Notes", properties: [{ name: "content" }] },
      objects: new Map(),
    });
    await make(fake, { collection: "Notes" }).store([{ id: "a", vector: [1] }]);
    const added = fake.calls
      .filter((c) => c.url.endsWith("/v1/schema/Notes/properties"))
      .map((c) => c.body.name);
    expect(added).toEqual(["rag_id", "rag_source", "rag_metadata"]);
  });

  it("sends the API key as a bearer token and never puts it in errors", async () => {
    const fake = fakeWeaviate({ apiKey: "secret-key-123" });
    const wrong = make(fake, { apiKey: "wrong-key-456" });
    const err = await wrong.size().catch((e) => e);
    expect(err.message).toBe(
      "WeaviateRetriever: Weaviate refused the request (401); check WEAVIATE_API_KEY",
    );
    expect(err.message).not.toContain("wrong-key-456");
    const right = make(fake, { apiKey: "secret-key-123" });
    await right.store([{ id: "a", vector: [1, 0] }]);
    expect(fake.calls[fake.calls.length - 1].headers.authorization).toBe(
      "Bearer secret-key-123",
    );
    // A server that echoes the key back.
    const echo = new WeaviateRetriever({
      apiKey: "secret-key-123",
      fetch: async () => {
        throw new Error("bad header secret-key-123");
      },
    });
    const down = await echo.size().catch((e) => e);
    expect(down.message).toBe(
      "WeaviateRetriever: cannot reach Weaviate at http://localhost:8080 (bad header ***)",
    );
  });

  it("reports GraphQL errors, REST errors and an unreachable server", async () => {
    const graphqlError = jest.fn(async (url) => ({
      status: 200,
      ok: true,
      statusText: "",
      text: async () =>
        url.endsWith("/graphql")
          ? JSON.stringify({
              errors: [{ message: "vector lengths don't match: 4 vs 3" }],
            })
          : JSON.stringify({ class: "RagDocuments" }),
    }));
    await expect(
      new WeaviateRetriever({ fetch: graphqlError }).retrieve([1, 2, 3]),
    ).rejects.toThrow(
      "WeaviateRetriever: GraphQL query failed: vector lengths don't match: 4 vs 3",
    );
    const restError = jest.fn(async () => ({
      status: 422,
      ok: false,
      statusText: "",
      text: async () =>
        JSON.stringify({ error: [{ message: "invalid class name" }] }),
    }));
    await expect(
      new WeaviateRetriever({ fetch: restError }).size(),
    ).rejects.toThrow(
      "WeaviateRetriever: GET /schema/RagDocuments failed (422): invalid class name",
    );
    const down = jest.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    await expect(
      new WeaviateRetriever({ fetch: down, url: "http://w:1" }).size(),
    ).rejects.toThrow(
      "cannot reach Weaviate at http://w:1 (connect ECONNREFUSED)",
    );
  });

  it("validates input and has no cache identity unless given a cacheKey", async () => {
    const fetch = jest.fn();
    for (const collection of ["../x", "1abc", "a-b", ""]) {
      expect(() => new WeaviateRetriever({ fetch, collection })).toThrow(
        "invalid collection name",
      );
    }
    expect(() => new WeaviateRetriever({ fetch, dimensions: 0 })).toThrow(
      "positive integer",
    );
    const retriever = new WeaviateRetriever({ fetch });
    await expect(
      retriever.store([{ id: "a", vector: [1, Infinity] }]),
    ).rejects.toThrow("non-finite");
    await expect(
      retriever.store([
        { id: "a", vector: [1, 0] },
        { id: "b", vector: [1] },
      ]),
    ).rejects.toThrow('document "b" has 1 dimensions, the batch has 2');
    await expect(
      retriever.retrieve({ queryVector: [1], topK: 0 }),
    ).rejects.toThrow("topK must be a positive integer");
    expect(fetch).not.toHaveBeenCalled();
    expect(retriever.getCacheKey("retriever")).toBeNull();
    expect(
      new WeaviateRetriever({ fetch, cacheKey: "v1" }).getCacheKey("retriever"),
    ).toBe("weaviate|http://localhost:8080|RagDocuments|v1");
  });

  it("reads the URL from the config or WEAVIATE_URL and the key only from WEAVIATE_API_KEY", () => {
    const {
      buildComponents,
    } = require("../../../src/config/component-factory");
    const config = (retriever) => ({
      pipeline: [
        { stage: "embedder", name: "local" },
        { stage: "retriever", name: "weaviate", config: retriever },
      ],
    });
    const saved = {
      url: process.env.WEAVIATE_URL,
      key: process.env.WEAVIATE_API_KEY,
    };
    process.env.WEAVIATE_URL = "http://env-weaviate:8080";
    process.env.WEAVIATE_API_KEY = "from-env";
    try {
      const fromEnv = buildComponents(
        config({ collection: "Docs", apiKey: "ignored", dimensions: 8 }),
      ).retriever;
      expect(fromEnv.constructor.name).toBe("WeaviateRetriever");
      expect(fromEnv.url).toBe("http://env-weaviate:8080");
      expect(fromEnv._apiKey).toBe("from-env");
      expect(fromEnv.collection).toBe("Docs");
      expect(fromEnv.dimensions).toBe(8);
      const fromConfig = buildComponents(
        config({ url: "http://cfg:8080" }),
      ).retriever;
      expect(fromConfig.url).toBe("http://cfg:8080");
      delete process.env.WEAVIATE_URL;
      expect(buildComponents(config({})).retriever.url).toBe(
        "http://localhost:8080",
      );
    } finally {
      for (const [k, v] of [
        ["WEAVIATE_URL", saved.url],
        ["WEAVIATE_API_KEY", saved.key],
      ]) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it("is exported from the main, connectors and edge entry points", () => {
    // Fresh: jest.setup.js resets the module registry between tests.
    const {
      WeaviateRetriever,
    } = require("../../../src/retrieval/weaviate-retriever");
    expect(require("../../../src/index").WeaviateRetriever).toBe(
      WeaviateRetriever,
    );
    expect(require("../../../src/packages/connectors").WeaviateRetriever).toBe(
      WeaviateRetriever,
    );
    expect(require("../../../src/edge").WeaviateRetriever).toBe(
      WeaviateRetriever,
    );
  });
});
