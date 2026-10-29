"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { MemoryCache } = require("../../../src/cache/memory-cache");
const { RedisCache } = require("../../../src/cache/redis-cache");
const { createRagPipeline } = require("../../../src/core/create-pipeline");
const { MemoryRetriever } = require("../../../src/connectors/memory-retriever");
const { LocalEmbedder } = require("../../../src/connectors/local-embedder");
const { FileVectorStore } = require("../../../src/retrieval/file-vector-store");
const {
  GuardrailsPipeline,
} = require("../../../src/guardrails/guardrails-pipeline");
const { HashEmbedder, EchoLLM, fixtures } = require("../../../src/testing");

const QUERY = "How many vacation days do I get?";

async function indexed(
  embedder = new HashEmbedder(),
  docs = fixtures.documents,
) {
  const retriever = new MemoryRetriever();
  await retriever.store(
    await Promise.all(
      docs.map(async (d) => ({
        ...d,
        vector: await embedder.embed(d.content),
      })),
    ),
  );
  return { embedder, retriever };
}

describe("MemoryCache", () => {
  test("evicts the least recently used entry", async () => {
    const cache = new MemoryCache({ maxEntries: 2 });
    await cache.set("a", 1);
    await cache.set("b", 2);
    await cache.get("a"); // a is now the most recent
    await cache.set("c", 3);
    expect(await cache.get("b")).toBeUndefined();
    expect(await cache.get("a")).toBe(1);
    expect(await cache.get("c")).toBe(3);
  });

  test("expires entries after their time to live", async () => {
    const cache = new MemoryCache();
    const now = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    await cache.set("k", "v", { ttlSeconds: 10 });
    now.mockReturnValue(1_000_000 + 9_000);
    expect(await cache.get("k")).toBe("v");
    now.mockReturnValue(1_000_000 + 10_000);
    expect(await cache.get("k")).toBeUndefined();
    now.mockRestore();
  });

  test("returns copies and counts hits and misses", async () => {
    const cache = new MemoryCache();
    const value = { list: [1] };
    await cache.set("k", value);
    value.list.push(2);
    const read = await cache.get("k");
    read.list.push(3);
    expect(await cache.get("k")).toEqual({ list: [1] });
    await cache.get("missing");
    expect(await cache.stats()).toEqual({ hits: 2, misses: 1, size: 1 });
  });
});

describe("RedisCache", () => {
  function fakeClient(kind) {
    const store = new Map();
    const calls = [];
    const client = {
      get: async (k) => (store.has(k) ? store.get(k) : null),
      set: async (...args) => {
        calls.push(args);
        store.set(args[0], args[1]);
      },
      del: async (k) => store.delete(k),
    };
    if (kind === "node-redis") client.isOpen = true;
    return { client, calls, store };
  }

  test("node-redis: JSON values, prefix and { PX } expiry", async () => {
    const { client, calls } = fakeClient("node-redis");
    const cache = new RedisCache({ client, prefix: "t:", ttlSeconds: 2 });
    await cache.set("k", { a: 1 });
    expect(calls[0]).toEqual(["t:k", '{"a":1}', { PX: 2000 }]);
    expect(await cache.get("k")).toEqual({ a: 1 });
    await cache.delete("k");
    expect(await cache.get("k")).toBeUndefined();
  });

  test("ioredis: positional PX expiry", async () => {
    const { client, calls } = fakeClient("ioredis");
    await new RedisCache({ client }).set("k", 1, { ttlSeconds: 1.5 });
    expect(calls[0]).toEqual(["rag:k", "1", "PX", 1500]);
  });

  test("rejects a missing client", () => {
    expect(() => new RedisCache({})).toThrow(/needs a connected client/);
  });
});

describe("createRagPipeline({ cache })", () => {
  beforeAll(() => jest.useRealTimers());

  test("a repeated query hits all three layers and calls the llm once", async () => {
    const { embedder, retriever } = await indexed();
    const llm = new EchoLLM();
    const pipeline = createRagPipeline({
      embedder,
      retriever,
      llm,
      cache: true,
    });

    const first = await pipeline.run({ query: QUERY });
    const second = await pipeline.run({ query: QUERY });

    expect(first.cache).toEqual({
      embeddings: "miss",
      retrieval: "miss",
      generation: "miss",
    });
    expect(second.cache).toEqual({
      embeddings: "hit",
      retrieval: "hit",
      generation: "hit",
    });
    expect(second.answer).toBe(first.answer);
    expect(second.results).toEqual(first.results);
    expect(llm.calls).toHaveLength(1);
    expect(pipeline.cacheStats().generation).toEqual({
      hits: 1,
      misses: 1,
      skipped: 0,
    });
  });

  test("storing documents invalidates retrieval and generation", async () => {
    const { embedder, retriever } = await indexed();
    const pipeline = createRagPipeline({
      embedder,
      retriever,
      llm: new EchoLLM(),
      cache: true,
    });
    await pipeline.run({ query: QUERY });

    const update =
      "Vacation policy update: full-time employees now receive twenty-five days.";
    await retriever.store([
      { id: "update", content: update, vector: await embedder.embed(update) },
    ]);
    const after = await pipeline.run({ query: QUERY });

    expect(after.cache).toEqual({
      embeddings: "hit",
      retrieval: "miss",
      generation: "miss",
    });
    expect(after.results.map((r) => r.id)).toContain("update");
  });

  test("retraining a LocalEmbedder invalidates cached query vectors", async () => {
    const embedder = new LocalEmbedder();
    embedder.train(fixtures.documents.map((d) => d.content));
    const { retriever } = await indexed(embedder);
    const pipeline = createRagPipeline({
      embedder,
      retriever,
      cache: { embeddings: true },
    });
    await pipeline.run({ query: QUERY });
    expect((await pipeline.run({ query: QUERY })).cache.embeddings).toBe("hit");

    // Retraining changes the vocabulary (and the vector size), so the index
    // is rebuilt too, as it would be in real use.
    const corpus = [
      ...fixtures.documents,
      { id: "parking", content: "Parking is free for all employees." },
    ];
    embedder.train(corpus.map((d) => d.content));
    await retriever.clear();
    await retriever.store(
      corpus.map((d) => ({ ...d, vector: embedder.embed(d.content) })),
    );
    expect((await pipeline.run({ query: QUERY })).cache.embeddings).toBe(
      "miss",
    );
  });

  test("FileVectorStore: a change to the index invalidates retrieval", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-cache-"));
    try {
      const embedder = new HashEmbedder();
      const store = new FileVectorStore({ path: path.join(dir, "index.json") });
      const docs = await Promise.all(
        fixtures.documents.map(async (d) => ({
          ...d,
          vector: await embedder.embed(d.content),
        })),
      );
      await store.store(docs);
      store.save();

      // A fresh store reading the same saved index shares cached results.
      const shared = new MemoryCache();
      const reader1 = createRagPipeline({
        embedder,
        retriever: new FileVectorStore({ path: path.join(dir, "index.json") }),
        cache: { retrieval: shared },
      });
      const reader2 = createRagPipeline({
        embedder,
        retriever: new FileVectorStore({ path: path.join(dir, "index.json") }),
        cache: { retrieval: shared },
      });
      expect((await reader1.run({ query: QUERY })).cache.retrieval).toBe(
        "miss",
      );
      expect((await reader2.run({ query: QUERY })).cache.retrieval).toBe("hit");

      // After the second store writes, it no longer matches the first's state.
      const writerStore = new FileVectorStore({
        path: path.join(dir, "index.json"),
      });
      const writer = createRagPipeline({
        embedder,
        retriever: writerStore,
        cache: { retrieval: shared },
      });
      writerStore.removeBySource(undefined);
      await writerStore.store([
        {
          id: "extra",
          content: "Extra.",
          vector: await embedder.embed("Extra."),
        },
      ]);
      expect((await writer.run({ query: QUERY })).cache.retrieval).toBe("miss");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a different topK or query vector is a different retrieval entry", async () => {
    const { embedder, retriever } = await indexed();
    const pipeline = createRagPipeline({ embedder, retriever, cache: true });
    await pipeline.run({ query: QUERY, options: { topK: 1 } });
    expect(
      (await pipeline.run({ query: QUERY, options: { topK: 2 } })).cache
        .retrieval,
    ).toBe("miss");
    const vector = await embedder.embed("travel receipts");
    const byVector = await pipeline.run({
      queryVector: vector,
      options: { topK: 1 },
    });
    expect(byVector.cache.retrieval).toBe("miss");
    expect(byVector.results[0].id).toBe("expenses");
  });

  test("ACL guardrails still filter cached results per user", async () => {
    const embedder = new HashEmbedder();
    const secret = {
      id: "salaries",
      content: "Vacation days for executives: forty days, approved by HR.",
      metadata: { acl: ["hr"] },
    };
    const { retriever } = await indexed(embedder, [
      ...fixtures.documents,
      secret,
    ]);
    const llm = new EchoLLM({
      answer: (q, docs) => docs.map((d) => d.id).join(","),
    });
    const guarded = new GuardrailsPipeline(
      createRagPipeline({ embedder, retriever, llm, cache: true }),
      { retrieval: { enforceACL: true } },
    );

    const hr = await guarded.run({
      query: "vacation days",
      context: { userPermissions: ["hr"] },
      options: { topK: 4 },
    });
    const staff = await guarded.run({
      query: "vacation days",
      context: { userPermissions: ["staff"] },
      options: { topK: 4 },
    });

    expect(hr.answer).toContain("salaries");
    expect(staff.answer).not.toContain("salaries");
    expect(staff.results.map((r) => r.id)).not.toContain("salaries");
  });

  test("an llm with temperature above 0 is not cached", async () => {
    const { embedder, retriever } = await indexed();
    const llm = Object.assign(new EchoLLM(), { config: { temperature: 0.7 } });
    const pipeline = createRagPipeline({
      embedder,
      retriever,
      llm,
      cache: true,
    });
    await pipeline.run({ query: QUERY });
    const second = await pipeline.run({ query: QUERY });
    expect(second.cache.generation).toBe("skip");
    expect(llm.calls).toHaveLength(2);

    // A per-run temperature of 0 makes it cacheable.
    await pipeline.run({ query: QUERY, options: { temperature: 0 } });
    const fourth = await pipeline.run({
      query: QUERY,
      options: { temperature: 0 },
    });
    expect(fourth.cache.generation).toBe("hit");
  });

  test("nothing from a timed-out run is stored", async () => {
    const { embedder, retriever } = await indexed();
    let slow = true;
    const llm = {
      cacheKey: "slow-llm",
      async generate(q, docs, { signal } = {}) {
        if (slow) {
          await new Promise((resolve, reject) => {
            const t = setTimeout(resolve, 5000);
            signal.addEventListener("abort", () => {
              clearTimeout(t);
              reject(signal.reason);
            });
          });
        }
        return "fast answer";
      },
    };
    const pipeline = createRagPipeline({
      embedder,
      retriever,
      llm,
      cache: true,
    });
    const timedOut = await pipeline.run({
      query: QUERY,
      options: { timeout: 50 },
    });
    expect(timedOut.success).toBe(false);

    slow = false;
    const next = await pipeline.run({ query: QUERY });
    expect(next.cache.generation).toBe("miss");
    expect(next.answer).toBe("fast answer");
  });

  test("streams: a finished stream is cached, a partial one is not", async () => {
    const { embedder, retriever } = await indexed();
    const llm = new EchoLLM({ answer: "Twenty days of paid vacation." });
    const pipeline = createRagPipeline({
      embedder,
      retriever,
      llm,
      cache: true,
    });

    // Stop reading after the first token: nothing is stored.
    for await (const chunk of await pipeline.run({
      query: QUERY,
      options: { stream: true },
    })) {
      if (chunk.token) break;
    }
    let text = "";
    for await (const chunk of await pipeline.run({
      query: QUERY,
      options: { stream: true },
    })) {
      text += chunk.token || "";
    }
    expect(text).toBe("Twenty days of paid vacation.");
    expect(llm.calls).toHaveLength(2);

    // The finished stream was stored: the next one comes from the cache.
    let cached = "";
    for await (const chunk of await pipeline.run({
      query: QUERY,
      options: { stream: true },
    })) {
      cached += chunk.token || "";
    }
    expect(cached).toBe("Twenty days of paid vacation.");
    expect(llm.calls).toHaveLength(2);
  });

  test("a component without a cache key is skipped, with one warning", async () => {
    const warn = jest
      .spyOn(process, "emitWarning")
      .mockImplementation(() => {});
    const { embedder, retriever } = await indexed();
    const llm = { generate: async () => "x" }; // no cacheKey
    // The warning is once per process; load the pipeline fresh to see it.
    let fresh;
    jest.isolateModules(() => {
      fresh = require("../../../src/core/create-pipeline").createRagPipeline;
    });
    const pipeline = fresh({
      embedder,
      retriever,
      llm,
      cache: true,
    });
    await pipeline.run({ query: QUERY });
    const second = await pipeline.run({ query: QUERY });
    expect(second.cache.generation).toBe("skip");
    expect(
      warn.mock.calls.filter(
        ([, o]) => o && o.code === "RAG_CACHE_NO_KEY_GENERATION",
      ),
    ).toHaveLength(1);
    warn.mockRestore();
  });

  test("a failing cache backend does not fail the run", async () => {
    const warn = jest
      .spyOn(process, "emitWarning")
      .mockImplementation(() => {});
    const broken = {
      get: async () => {
        throw new Error("redis down");
      },
      set: async () => {
        throw new Error("redis down");
      },
    };
    const { embedder, retriever } = await indexed();
    const result = await createRagPipeline({
      embedder,
      retriever,
      llm: new EchoLLM(),
      cache: broken,
    }).run({ query: QUERY });
    expect(result.success).toBe(true);
    expect(result.results[0].id).toBe("vacation");
    warn.mockRestore();
  });

  test("without a cache option nothing changes", async () => {
    const { embedder, retriever } = await indexed();
    const pipeline = createRagPipeline({
      embedder,
      retriever,
      llm: new EchoLLM(),
    });
    const result = await pipeline.run({ query: QUERY });
    expect(result).not.toHaveProperty("cache");
    expect(pipeline.cacheStats()).toBeNull();
  });
});
