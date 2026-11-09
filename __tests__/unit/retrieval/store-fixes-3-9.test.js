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
