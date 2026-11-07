/**
 * RetrievalGuard reads every place an ACL can be set, and the built-in
 * stores keep a top-level `acl` / `requiredRole` on their results.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { RetrievalGuard } = require("../../../src/guardrails/retrieval-guard");
const { MemoryRetriever } = require("../../../src/connectors/memory-retriever");
const { FileVectorStore } = require("../../../src/retrieval/file-vector-store");
const { BM25Search } = require("../../../src/retrieval/bm25-search");

const guard = new RetrievalGuard({ enforceACL: true });
const kept = (results, userPermissions) =>
  guard.filter(results, { userPermissions }).results.map((r) => r.id);

describe("RetrievalGuard ACL sources", () => {
  test("a string of permissions is one whole role", () => {
    const docs = [{ id: "a", score: 1, metadata: { acl: ["admin"] } }];
    expect(kept(docs, "not-an-admin")).toEqual([]);
    expect(kept(docs, "admin")).toEqual(["a"]);
  });

  test("a Set of permissions works like an array", () => {
    const docs = [{ id: "a", score: 1, metadata: { acl: ["admin"] } }];
    expect(kept(docs, new Set(["admin"]))).toEqual(["a"]);
    expect(kept(docs, new Set(["user"]))).toEqual([]);
  });

  test("permissions of another type are no roles", () => {
    const docs = [{ id: "a", score: 1, metadata: { acl: ["admin"] } }];
    expect(kept(docs, { admin: true })).toEqual([]);
    expect(kept(docs, 42)).toEqual([]);
  });

  test.each([
    ["an empty top-level acl", { acl: [] }],
    ["an empty top-level requiredRole", { requiredRole: "" }],
    ["a null top-level acl", { acl: null }],
  ])("%s doesn't hide the metadata acl", (_label, top) => {
    const docs = [{ id: "a", score: 1, ...top, metadata: { acl: ["admin"] } }];
    expect(kept(docs, [])).toEqual([]);
    expect(kept(docs, ["admin"])).toEqual(["a"]);
  });

  test("empty metadata doesn't hide an acl on doc", () => {
    const docs = [{ id: "a", score: 1, metadata: {}, doc: { acl: ["hr"] } }];
    expect(kept(docs, [])).toEqual([]);
    expect(kept(docs, ["hr"])).toEqual(["a"]);
  });

  test("every restriction that is set must be met", () => {
    const docs = [
      { id: "a", score: 1, acl: ["hr"], metadata: { requiredRole: "admin" } },
    ];
    expect(kept(docs, ["hr"])).toEqual([]);
    expect(kept(docs, ["admin"])).toEqual([]);
    expect(kept(docs, ["hr", "admin"])).toEqual(["a"]);
  });

  test.each([
    ["requiredRole 0", { requiredRole: 0 }],
    ["requiredRole false", { requiredRole: false }],
    ["acl 0", { acl: 0 }],
  ])("a falsy role such as %s still restricts", (_label, top) => {
    const docs = [{ id: "a", score: 1, ...top }];
    expect(kept(docs, [5])).toEqual([]);
  });

  test("an acl entry that is an empty string still restricts", () => {
    const docs = [{ id: "a", score: 1, acl: [""] }];
    expect(kept(docs, ["user"])).toEqual([]);
  });

  test("unrestricted documents pass for everyone", () => {
    const docs = [{ id: "a", score: 1, metadata: {} }];
    expect(kept(docs, undefined)).toEqual(["a"]);
  });
});

describe("stores keep top-level access fields", () => {
  const restricted = [
    { id: "open", content: "public note", vector: [1, 0] },
    {
      id: "acl",
      content: "board note",
      vector: [1, 0.1],
      acl: ["exec"],
    },
    {
      id: "role",
      content: "payroll note",
      vector: [1, 0.2],
      requiredRole: "hr",
    },
  ];

  test("MemoryRetriever", async () => {
    const store = new MemoryRetriever();
    await store.store(restricted);
    const results = await store.retrieve({ queryVector: [1, 0], topK: 3 });
    expect(results.find((r) => r.id === "acl").acl).toEqual(["exec"]);
    expect(results.find((r) => r.id === "role").requiredRole).toBe("hr");
    expect(results.find((r) => r.id === "open")).not.toHaveProperty("acl");
    expect(kept(results, [])).toEqual(["open"]);
  });

  test("FileVectorStore, also after saving and loading", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acl-store-"));
    try {
      const file = path.join(dir, "index.json");
      const store = new FileVectorStore({ path: file });
      await store.store(restricted);
      store.save();
      const reloaded = new FileVectorStore({ path: file });
      for (const s of [store, reloaded]) {
        const results = await s.retrieve({ queryVector: [1, 0], topK: 3 });
        expect(kept(results, []).sort()).toEqual(["open"]);
        expect(kept(results, ["exec"]).sort()).toEqual(["acl", "open"]);
        expect(s.list().find((d) => d.id === "role").requiredRole).toBe("hr");
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("BM25Search", () => {
    const bm25 = new BM25Search();
    bm25.index(restricted);
    const results = bm25.search("note", { k: 3 });
    expect(kept(results, []).sort()).toEqual(["open"]);
  });
});
