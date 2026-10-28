"use strict";

const { MemoryRetriever } = require("../../../src/connectors/memory-retriever");

const doc = (id, vector = [1, 0, 0]) => ({ id, vector, content: id });

describe("MemoryRetriever maxDocuments", () => {
  test("throws instead of growing past maxDocuments, leaving the store unchanged", async () => {
    const retriever = new MemoryRetriever({ maxDocuments: 2 });
    await retriever.store([doc("a"), doc("b")]);
    await expect(retriever.store([doc("c")])).rejects.toThrow(
      /exceeding maxDocuments \(2\)/,
    );
    expect(retriever.getStats().documentCount).toBe(2);
    expect([...retriever.documents.keys()]).toEqual(["a", "b"]);
  });

  test("a batch that would overflow is rejected before any insert", async () => {
    const retriever = new MemoryRetriever({ maxDocuments: 3 });
    await retriever.store([doc("a")]);
    await expect(
      retriever.store([doc("b"), doc("c"), doc("d")]),
    ).rejects.toThrow(/maxDocuments/);
    expect(retriever.getStats().documentCount).toBe(1);
  });

  test("overwriting existing ids does not count against the limit", async () => {
    const retriever = new MemoryRetriever({ maxDocuments: 2 });
    await retriever.store([doc("a"), doc("b")]);
    await expect(
      retriever.store([doc("a", [0, 1, 0])]),
    ).resolves.toBeUndefined();
    expect(retriever.getStats().documentCount).toBe(2);
  });

  test("eviction: 'fifo' drops the oldest documents", async () => {
    const retriever = new MemoryRetriever({
      maxDocuments: 2,
      eviction: "fifo",
    });
    const evicted = jest.fn();
    retriever.on("evicted", evicted);
    await retriever.store([doc("a"), doc("b")]);
    await retriever.store([doc("c")]);
    expect([...retriever.documents.keys()]).toEqual(["b", "c"]);
    expect(evicted).toHaveBeenCalledWith({ count: 1, total: 2 });
  });

  test("eviction: 'fifo' still rejects a single batch larger than the limit", async () => {
    const retriever = new MemoryRetriever({
      maxDocuments: 1,
      eviction: "fifo",
    });
    await expect(retriever.store([doc("a"), doc("b")])).rejects.toThrow(
      /batch of 2 new documents exceeds maxDocuments/,
    );
  });

  test("unknown eviction value is rejected", () => {
    expect(() => new MemoryRetriever({ eviction: "lru" })).toThrow(
      /unknown eviction/,
    );
  });
});

describe("MemoryRetriever vector dimensions", () => {
  test("store() rejects vectors of a different dimension", async () => {
    const retriever = new MemoryRetriever();
    await retriever.store([doc("a", [1, 0, 0])]);
    await expect(retriever.store([doc("b", [1, 0])])).rejects.toThrow(
      /document "b" has 2 dimensions but the store holds 3-dimension vectors/,
    );
    await expect(
      retriever.store([doc("c", [1, 0, 0]), doc("d", [1])]),
    ).rejects.toThrow(/dimensions/);
    expect(retriever.getStats()).toMatchObject({
      documentCount: 1,
      dimensions: 3,
    });
  });

  test("retrieve() throws on a query vector of a different dimension instead of truncating", async () => {
    const retriever = new MemoryRetriever();
    await retriever.store([doc("a", [1, 0, 0])]);
    await expect(retriever.retrieve([1, 0], 1)).rejects.toThrow(
      /Query vector has 2 dimensions but the store holds 3-dimension vectors/,
    );
  });

  test("clear() resets the dimension", async () => {
    const retriever = new MemoryRetriever();
    await retriever.store([doc("a", [1, 0, 0])]);
    await retriever.clear();
    await retriever.store([doc("b", [1, 0])]);
    expect(retriever.getStats().dimensions).toBe(2);
  });

  test("_cosineSimilarity throws on mismatched lengths", () => {
    const retriever = new MemoryRetriever();
    expect(() => retriever._cosineSimilarity([1, 0], [1, 0, 0])).toThrow(
      /different dimensions/,
    );
  });
});
