"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { FileVectorStore } = require("../../../src/retrieval/file-vector-store");
const { MemoryRetriever } = require("../../../src/connectors/memory-retriever");

let dir;
let counter = 0;
const newPath = () => path.join(dir, `idx-${counter++}.json`);
const doc = (id, vector) => ({ id, content: id, vector });

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "rpu-reembed-"));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe.each([
  ["FileVectorStore", () => new FileVectorStore({ path: newPath() })],
  ["MemoryRetriever", () => new MemoryRetriever()],
])("%s re-embedding after the embedder is refit", (_name, make) => {
  test("a full batch at a new dimension replaces every vector", async () => {
    const s = make();
    await s.store([doc("a", [1, 0]), doc("b", [0, 1])]);
    await s.store([doc("a", [1, 0, 0]), doc("b", [0, 1, 0])]);
    const hits = await s.retrieve({ queryVector: [0, 1, 0], topK: 5 });
    expect(hits.map((h) => h.id)[0]).toBe("b");
    expect(hits).toHaveLength(2);
    await expect(
      s.store([doc("c", [1, 0]), doc("a", [1, 0]), doc("b", [1, 0])]),
    ).resolves.toBeUndefined();
  });

  test("a partial batch at a new dimension is rejected and changes nothing", async () => {
    const s = make();
    await s.store([doc("a", [1, 0]), doc("b", [0, 1])]);
    await expect(
      s.store([doc("a", [1, 0, 0]), doc("c", [0, 0, 1])]),
    ).rejects.toThrow(/re-ingest|rebuild/i);
    const hits = await s.retrieve({ queryVector: [0, 1], topK: 5 });
    expect(hits.map((h) => h.id).sort()).toEqual(["a", "b"]);
  });

  test("a batch that mixes dimensions is still rejected", async () => {
    const s = make();
    await s.store([doc("a", [1, 0])]);
    await expect(
      s.store([doc("a", [1, 0, 0]), doc("b", [1, 0])]),
    ).rejects.toThrow(/dimension/);
    const hits = await s.retrieve({ queryVector: [1, 0], topK: 5 });
    expect(hits.map((h) => h.id)).toEqual(["a"]);
  });
});

describe("FileVectorStore.save() after a refit embedder", () => {
  test("saves a full replacement at a new dimension", async () => {
    const p = newPath();
    const first = new FileVectorStore({ path: p });
    await first.store([doc("a", [1, 0]), doc("b", [0, 1])]);
    first.setEmbedderInfo({ name: "local", dimensions: 2 });
    first.save();

    const second = new FileVectorStore({ path: p });
    await second.store([doc("a", [1, 0, 0]), doc("b", [0, 1, 0])]);
    second.setEmbedderInfo({ name: "local", dimensions: 3 });
    expect(() => second.save()).not.toThrow();

    const reread = new FileVectorStore({ path: p });
    expect(reread.getEmbedderInfo().dimensions).toBe(3);
    const hits = await reread.retrieve({ queryVector: [0, 1, 0], topK: 5 });
    expect(hits).toHaveLength(2);
    expect(hits[0].id).toBe("b");
  });

  test("refuses to save over a document another process added meanwhile", async () => {
    const p = newPath();
    const first = new FileVectorStore({ path: p });
    await first.store([doc("a", [1, 0])]);
    first.setEmbedderInfo({ name: "local", dimensions: 2 });
    first.save();

    const refit = new FileVectorStore({ path: p });
    await refit.store([doc("a", [1, 0, 0])]);
    refit.setEmbedderInfo({ name: "local", dimensions: 3 });

    const other = new FileVectorStore({ path: p });
    await other.store([doc("late", [0, 1])]);
    other.save();

    expect(() => refit.save()).toThrow(/different embedder/);
    const reread = new FileVectorStore({ path: p });
    expect(reread.getEmbedderInfo().dimensions).toBe(2);
  });
});
