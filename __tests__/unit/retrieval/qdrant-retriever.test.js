"use strict";

// jest.setup.js resets modules after every test, so load per test.
let QdrantRetriever;
let pointId;

beforeEach(() => {
  ({
    QdrantRetriever,
    pointId,
  } = require("../../../src/retrieval/qdrant-retriever"));
});

/** A fetch that records requests and answers from a list of responses. */
function fakeFetch(responses = []) {
  const requests = [];
  const fetch = jest.fn(async (url, init = {}) => {
    requests.push({
      url,
      method: init.method,
      headers: init.headers,
      body: init.body ? JSON.parse(init.body) : undefined,
    });
    const next = responses.length
      ? responses.shift()
      : { status: 200, json: { result: {} } };
    if (next instanceof Error) throw next;
    return {
      status: next.status,
      ok: next.status >= 200 && next.status < 300,
      statusText: "",
      text: async () => JSON.stringify(next.json || {}),
    };
  });
  return { fetch, requests };
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("QdrantRetriever", () => {
  it("maps document ids to stable UUIDs", () => {
    expect(pointId("docs/vacation.md#0")).toMatch(UUID);
    expect(pointId("docs/vacation.md#0")).toBe(pointId("docs/vacation.md#0"));
    expect(pointId("docs/vacation.md#0")).not.toBe(
      pointId("docs/vacation.md#1"),
    );
  });

  it("creates the collection and index, then upserts and waits", async () => {
    const { fetch, requests } = fakeFetch([
      { status: 404 },
      { status: 200, json: { result: true } },
      { status: 200, json: { result: {} } },
      { status: 200, json: { result: {} } },
    ]);
    const retriever = new QdrantRetriever({ url: "http://q:6333/", fetch });
    await retriever.store([
      {
        id: "a.md#0",
        vector: [1, 0, 0],
        content: "A",
        metadata: { source: "a.md" },
      },
    ]);
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      "GET http://q:6333/collections/rag_documents",
      "PUT http://q:6333/collections/rag_documents",
      "PUT http://q:6333/collections/rag_documents/index?wait=true",
      "PUT http://q:6333/collections/rag_documents/points?wait=true",
    ]);
    expect(requests[1].body).toEqual({
      vectors: { size: 3, distance: "Cosine" },
    });
    expect(requests[2].body).toEqual({
      field_name: "metadata.source",
      field_schema: "keyword",
    });
    expect(requests[3].body).toEqual({
      points: [
        {
          id: pointId("a.md#0"),
          vector: [1, 0, 0],
          payload: {
            rag_id: "a.md#0",
            content: "A",
            metadata: { source: "a.md" },
          },
        },
      ],
    });
  });

  it("queries with /points/query and returns the original ids", async () => {
    const { fetch, requests } = fakeFetch([
      {
        status: 200,
        json: {
          result: {
            points: [
              {
                id: pointId("a.md#0"),
                score: 0.93,
                payload: {
                  rag_id: "a.md#0",
                  content: "A",
                  metadata: { source: "a.md" },
                },
              },
            ],
          },
        },
      },
    ]);
    const retriever = new QdrantRetriever({ fetch, collection: "docs-v2" });
    const results = await retriever.retrieve({ queryVector: [1, 0], topK: 4 });
    expect(requests[0].url).toBe(
      "http://localhost:6333/collections/docs-v2/points/query",
    );
    expect(requests[0].body).toEqual({
      query: [1, 0],
      limit: 4,
      with_payload: true,
      filter: { must_not: [{ is_empty: { key: "rag_id" } }] },
    });
    expect(results).toEqual([
      { id: "a.md#0", score: 0.93, content: "A", metadata: { source: "a.md" } },
    ]);
  });

  it("treats a missing collection as empty", async () => {
    const { fetch } = fakeFetch([
      { status: 404 },
      { status: 404 },
      { status: 404 },
    ]);
    const retriever = new QdrantRetriever({ fetch });
    expect(await retriever.retrieve({ queryVector: [1] })).toEqual([]);
    expect(await retriever.size()).toBe(0);
    expect(await retriever.list()).toEqual([]);
  });

  it("pages through list() and deletes by source", async () => {
    const point = (id) => ({
      payload: { rag_id: id, content: id, metadata: {} },
    });
    const { fetch, requests } = fakeFetch([
      {
        status: 200,
        json: {
          result: { points: [point("a"), point("b")], next_page_offset: "x" },
        },
      },
      {
        status: 200,
        json: { result: { points: [point("c")], next_page_offset: null } },
      },
      { status: 200, json: { result: {} } },
    ]);
    const retriever = new QdrantRetriever({ fetch });
    expect((await retriever.list()).map((d) => d.id)).toEqual(["a", "b", "c"]);
    expect(requests[1].body.offset).toBe("x");
    await retriever.removeBySource("a.md");
    expect(requests[2].url).toMatch(/\/points\/delete\?wait=true$/);
    expect(requests[2].body).toEqual({
      filter: { must: [{ key: "metadata.source", match: { value: "a.md" } }] },
    });
  });

  it("sends the API key and never puts it in errors", async () => {
    const { fetch, requests } = fakeFetch([
      { status: 403, json: { status: { error: "forbidden" } } },
    ]);
    const retriever = new QdrantRetriever({ fetch, apiKey: "secret-key-123" });
    const err = await retriever.retrieve({ queryVector: [1] }).catch((e) => e);
    expect(requests[0].headers["api-key"]).toBe("secret-key-123");
    // Compressed responses stall each request by ~40 ms
    expect(requests[0].headers["accept-encoding"]).toBe("identity");
    expect(err.message).toBe(
      "QdrantRetriever: Qdrant refused the request (403); check QDRANT_API_KEY",
    );
    expect(err.message).not.toContain("secret-key-123");
  });

  it("reports Qdrant errors and an unreachable server", async () => {
    const bad = fakeFetch([
      {
        status: 400,
        json: {
          status: {
            error:
              "Wrong input: Vector dimension error: expected dim: 4, got 3",
          },
        },
      },
    ]);
    await expect(
      new QdrantRetriever({ fetch: bad.fetch }).retrieve({
        queryVector: [1, 2, 3],
      }),
    ).rejects.toThrow(
      "POST /points/query failed (400): Wrong input: Vector dimension error: expected dim: 4, got 3",
    );
    const down = fakeFetch([new Error("connect ECONNREFUSED")]);
    await expect(
      new QdrantRetriever({ fetch: down.fetch, url: "http://q:1" }).size(),
    ).rejects.toThrow(
      "cannot reach Qdrant at http://q:1 (connect ECONNREFUSED)",
    );
  });

  it("validates input and has no cache identity unless given a cacheKey", async () => {
    const { fetch } = fakeFetch();
    expect(() => new QdrantRetriever({ fetch, collection: "../x" })).toThrow(
      "invalid collection name",
    );
    const retriever = new QdrantRetriever({ fetch });
    await expect(
      retriever.store([{ id: "a", vector: [1, Infinity] }]),
    ).rejects.toThrow("non-finite");
    await expect(
      retriever.store([
        { id: "a", vector: [1, 0] },
        { id: "b", vector: [1] },
      ]),
    ).rejects.toThrow('document "b" has 1 dimensions, the batch has 2');
    expect(fetch).not.toHaveBeenCalled();
    expect(retriever.getCacheKey("retriever")).toBeNull();
    expect(
      new QdrantRetriever({ fetch, cacheKey: "v1" }).getCacheKey("retriever"),
    ).toBe("qdrant|http://localhost:6333|rag_documents|v1");
  });

  it("reads the URL from the config or QDRANT_URL and the key only from QDRANT_API_KEY", () => {
    const {
      buildComponents,
    } = require("../../../src/config/component-factory");
    const config = (retriever) => ({
      pipeline: [
        { stage: "embedder", name: "local" },
        { stage: "retriever", name: "qdrant", config: retriever },
      ],
    });
    const saved = {
      url: process.env.QDRANT_URL,
      key: process.env.QDRANT_API_KEY,
    };
    process.env.QDRANT_URL = "http://env-qdrant:6333";
    process.env.QDRANT_API_KEY = "from-env";
    try {
      const fromEnv = buildComponents(
        config({ collection: "c1", apiKey: "ignored" }),
      ).retriever;
      expect(fromEnv.url).toBe("http://env-qdrant:6333");
      expect(fromEnv._apiKey).toBe("from-env");
      expect(fromEnv.collection).toBe("c1");
      const fromConfig = buildComponents(
        config({ url: "http://cfg:6333" }),
      ).retriever;
      expect(fromConfig.url).toBe("http://cfg:6333");
    } finally {
      for (const [k, v] of [
        ["QDRANT_URL", saved.url],
        ["QDRANT_API_KEY", saved.key],
      ]) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
