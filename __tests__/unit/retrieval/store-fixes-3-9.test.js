"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { FileVectorStore } = require("../../../src/retrieval/file-vector-store");
const { MemoryRetriever } = require("../../../src/connectors/memory-retriever");

let dir;
let counter = 0;
const newPath = () => path.join(dir, `idx-${counter++}.json`);

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "rpu-store-"));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("FileVectorStore scores are cosine similarity", () => {
  test.each([
    ["dense", [3, 4, 0, 0]],
    ["sparse", [0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 4]],
  ])(
    "identical %s vector scores 1 whatever the query magnitude",
    async (_n, v) => {
      const store = new FileVectorStore({ path: newPath() });
      await store.store([{ id: "a", content: "a", vector: v }]);
      for (const scale of [0.1, 1, 100]) {
        const [hit] = await store.retrieve({
          queryVector: v.map((x) => x * scale),
        });
        expect(hit.score).toBeCloseTo(1, 5);
      }
    },
  );

  test("matches MemoryRetriever scores", async () => {
    const docs = [
      { id: "a", content: "a", vector: [3, 4, 0] },
      { id: "b", content: "b", vector: [1, 1, 1] },
    ];
    const f = new FileVectorStore({ path: newPath() });
    const m = new MemoryRetriever();
    await f.store(docs);
    await m.store(docs);
    const q = [7, 1, 2];
    const fr = await f.retrieve({ queryVector: q });
    const mr = await m.retrieve({ queryVector: q });
    for (const r of fr) {
      expect(r.score).toBeCloseTo(mr.find((x) => x.id === r.id).score, 6);
    }
  });
});

describe("stores do not share objects with callers", () => {
  const { BM25Search } = require("../../../src/retrieval/bm25-search");
  const makeDocs = () => [
    {
      id: "a",
      content: "alpha beta",
      vector: [3, 4, 0, 0],
      metadata: { tag: "x", nested: { n: 1 } },
      acl: ["admin"],
      requiredRole: ["staff"],
    },
  ];

  test("MemoryRetriever: editing results or inputs does not change the store", async () => {
    const docs = makeDocs();
    const m = new MemoryRetriever();
    await m.store(docs);
    docs[0].vector[0] = -3;
    docs[0].metadata.tag = "late";
    docs[0].acl.push("guest");

    const [r] = await m.retrieve({ queryVector: [3, 4, 0, 0] });
    expect(r.score).toBeCloseTo(1, 6);
    expect(r.metadata.tag).toBe("x");
    expect(r.acl).toEqual(["admin"]);

    r.metadata.tag = "HACKED";
    r.metadata.nested.n = 99;
    r.acl.length = 0;
    r.requiredRole.push("guest");
    const [again] = await m.retrieve({ queryVector: [3, 4, 0, 0] });
    expect(again.metadata).toEqual({ tag: "x", nested: { n: 1 } });
    expect(again.acl).toEqual(["admin"]);
    expect(again.requiredRole).toEqual(["staff"]);
  });

  test("FileVectorStore: editing results, list() or inputs does not change the store", async () => {
    const docs = makeDocs();
    const f = new FileVectorStore({ path: newPath() });
    await f.store(docs);
    docs[0].metadata.tag = "late";
    docs[0].acl.push("guest");

    const [r] = await f.retrieve({ queryVector: [3, 4, 0, 0] });
    r.metadata.tag = "HACKED";
    r.acl.push("guest");
    const [l] = f.list();
    l.metadata.nested.n = 99;
    l.requiredRole.push("guest");

    const [again] = await f.retrieve({ queryVector: [3, 4, 0, 0] });
    expect(again.metadata).toEqual({ tag: "x", nested: { n: 1 } });
    expect(again.acl).toEqual(["admin"]);
    expect(again.requiredRole).toEqual(["staff"]);
  });

  test("BM25Search: editing results or the indexed array does not change the index", () => {
    const docs = makeDocs();
    const b = new BM25Search();
    b.index(docs);
    docs[0].metadata.tag = "late";
    docs[0].acl.push("guest");
    const [r] = b.search("alpha");
    expect(r.metadata.tag).toBe("x");
    r.metadata.tag = "HACKED";
    r.acl.push("guest");
    const [again] = b.search("alpha");
    expect(again.metadata.tag).toBe("x");
    expect(again.acl).toEqual(["admin"]);
  });
});
