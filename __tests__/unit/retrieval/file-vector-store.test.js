const fs = require("fs");
const os = require("os");
const path = require("path");
const { FileVectorStore } = require("../../../src/retrieval/file-vector-store");

describe("FileVectorStore", () => {
  let dir;
  let indexPath;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "fvs-"));
    indexPath = path.join(dir, "nested", "index.json");
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  async function seed() {
    const store = new FileVectorStore({ path: indexPath });
    store.setEmbedderInfo({ name: "test", dimensions: 2 });
    await store.store([
      { id: "a#0", vector: [1, 0], content: "A", metadata: { source: "a" } },
      { id: "b#0", vector: [0, 1], content: "B", metadata: { source: "b" } },
    ]);
    store.save();
    return store;
  }

  test("persists across instances and ranks by cosine similarity", async () => {
    await seed();
    const reopened = new FileVectorStore({ path: indexPath });

    const results = await reopened.retrieve({ queryVector: [0.1, 1], topK: 1 });

    expect(reopened.size()).toBe(2);
    expect(results.map((r) => r.id)).toEqual(["b#0"]);
    expect(results[0].metadata.source).toBe("b");
  });

  test("save leaves no temp files behind", async () => {
    await seed();
    expect(fs.readdirSync(path.dirname(indexPath))).toEqual(["index.json"]);
  });

  test("rejects a query vector with the wrong dimensions", async () => {
    const store = await seed();
    await expect(store.retrieve({ queryVector: [1, 0, 0] })).rejects.toThrow(
      /3 dimensions but the index was built with 2/,
    );
  });

  test("requires a query vector", async () => {
    const store = await seed();
    await expect(store.retrieve({ query: "text" })).rejects.toThrow(
      /queryVector is required/,
    );
  });

  test("removeBySource and clear", async () => {
    const store = await seed();
    expect(store.removeBySource("a")).toBe(1);
    expect(store.list().map((d) => d.id)).toEqual(["b#0"]);
    store.clear();
    expect(store.size()).toBe(0);
    expect(store.getEmbedderInfo()).toBeNull();
  });
});
