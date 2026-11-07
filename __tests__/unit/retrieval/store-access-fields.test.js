"use strict";

/**
 * Access restrictions (`acl`, `requiredRole`) set at a document's top level
 * survive every store and hybrid fusion, so RetrievalGuard still applies
 * them. Qdrant and pgvector run against in-memory fakes here; Pinecone and
 * Weaviate run the same check through the retriever contract.
 */

const { DOCS } = require("../../utils/retriever-contract");

// jest.setup.js resets modules after every test, so load per test.
let QdrantRetriever;
let PgVectorRetriever;
let reciprocalRankFusion;
let RetrievalGuard;
let readStoredMetadata;

beforeEach(() => {
  ({ QdrantRetriever } = require("../../../src/retrieval/qdrant-retriever"));
  ({
    PgVectorRetriever,
  } = require("../../../src/retrieval/pgvector-retriever"));
  ({ reciprocalRankFusion } = require("../../../src/retrieval/rank-fusion"));
  ({ RetrievalGuard } = require("../../../src/guardrails/retrieval-guard"));
  ({ readStoredMetadata } = require("../../../src/retrieval/access-fields"));
});

const dot = (a, b) => a.reduce((s, x, i) => s + x * (b[i] || 0), 0);

/** An in-memory Qdrant collection behind a fake fetch. */
function fakeQdrant() {
  const points = new Map();
  const reply = (result) => ({
    status: 200,
    ok: true,
    statusText: "",
    text: async () => JSON.stringify({ result }),
  });
  const fetch = async (url, init = {}) => {
    const path = new URL(url).pathname.replace(/^\/collections\/[^/]+/, "");
    const body = init.body ? JSON.parse(init.body) : {};
    if (init.method === "PUT" && path === "/points") {
      for (const p of body.points) points.set(p.id, p);
      return reply({ status: "completed" });
    }
    if (path === "/points/query") {
      const hits = [...points.values()]
        .map((p) => ({ ...p, score: dot(p.vector, body.query) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, body.limit);
      return reply({ points: hits });
    }
    if (path === "/points/scroll") {
      return reply({ points: [...points.values()], next_page_offset: null });
    }
    return reply({ status: "ok" });
  };
  return { fetch, points };
}

/** A pg Pool look-alike that keeps the rows it is given. */
function fakePgPool() {
  const rows = new Map();
  const query = async (text, params = []) => {
    if (/^INSERT INTO/.test(text)) {
      for (let i = 0; i < params.length; i += 4) {
        rows.set(params[i], {
          id: params[i],
          content: params[i + 1],
          metadata: JSON.parse(params[i + 2]),
        });
      }
      return { rows: [], rowCount: params.length / 4 };
    }
    if (/^SELECT id, content, metadata/.test(text)) {
      const all = [...rows.values()].map((r) => ({ ...r, score: 1 }));
      return { rows: all, rowCount: all.length };
    }
    return { rows: [], rowCount: 0 };
  };
  const client = { query, release: () => {} };
  return {
    rows,
    query,
    totalCount: 0,
    connect: async () => client,
    end: async () => {},
  };
}

// A result as a cache, a log or a copy of it sees it.
const copies = (results) => ({
  original: results,
  json: JSON.parse(JSON.stringify(results)),
  structuredClone: structuredClone(results),
});

const restricted = { ...DOCS[0], acl: ["hr"], requiredRole: "manager" };
const open = DOCS[2];

describe.each([
  ["QdrantRetriever", () => new QdrantRetriever({ fetch: fakeQdrant().fetch })],
  ["PgVectorRetriever", () => new PgVectorRetriever({ pool: fakePgPool() })],
])("%s keeps top-level access restrictions", (_name, make) => {
  it("through store(), retrieve() and list()", async () => {
    const retriever = make();
    await retriever.store([restricted, open]);
    const results = await retriever.retrieve({
      queryVector: restricted.vector,
      topK: 2,
    });
    const top = results.find((r) => r.id === restricted.id);
    expect(top).toMatchObject({ acl: ["hr"], requiredRole: "manager" });
    expect(top.metadata).toEqual(restricted.metadata);
    expect(results.find((r) => r.id === open.id)).not.toHaveProperty("acl");

    const listed = (await retriever.list()).find((r) => r.id === restricted.id);
    expect(listed).toMatchObject({ acl: ["hr"], requiredRole: "manager" });
    expect(listed.metadata).toEqual(restricted.metadata);
  });

  it("so RetrievalGuard removes the document for a user without the roles", async () => {
    const retriever = make();
    await retriever.store([restricted, open]);
    const results = await retriever.retrieve({
      queryVector: restricted.vector,
      topK: 2,
    });
    const guard = new RetrievalGuard({ enforceACL: true });
    const ids = (ctx) => guard.filter(results, ctx).results.map((r) => r.id);
    expect(ids({ userPermissions: ["employee"] })).toEqual([open.id]);
    expect(ids({ userPermissions: ["employee", "hr", "manager"] })).toEqual(
      expect.arrayContaining([restricted.id, open.id]),
    );
  });
});

describe("stored access fields that can't be read", () => {
  it.each([
    ["a string", "hr"],
    ["an array", ["hr"]],
    ["null", null],
  ])("as %s restrict the document to no one", (_kind, value) => {
    const { metadata, access } = readStoredMetadata({
      source: "a.md",
      rag_access: value,
    });
    expect(metadata).toEqual({ source: "a.md" });
    expect(access).toEqual({ acl: ["rag:no-access"] });
    const result = [{ id: "s", metadata, ...access }];
    const guard = new RetrievalGuard({ enforceACL: true });
    for (const [_how, copy] of Object.entries(copies(result))) {
      for (const roles of [["hr"], ["rag:no-access"], []]) {
        expect(guard.filter(copy, { userPermissions: roles }).results).toEqual(
          [],
        );
      }
    }
  });
});

describe("reciprocalRankFusion keeps every copy's access restrictions", () => {
  const guard = () => new RetrievalGuard({ enforceACL: true });
  const visible = (fused, roles) =>
    guard()
      .filter(fused, { userPermissions: roles })
      .results.map((r) => r.id);

  it("a restriction only on a later copy still applies", () => {
    const fused = reciprocalRankFusion([
      [{ id: "s", score: 0.9, content: "x", metadata: {} }],
      [{ id: "s", score: 3.1, content: "x", acl: ["hr"], metadata: {} }],
    ]);
    expect(fused).toHaveLength(1);
    expect(visible(fused, ["intern"])).toEqual([]);
    expect(visible(fused, ["hr"])).toEqual(["s"]);
  });

  it("a restriction in a later copy's metadata still applies", () => {
    const fused = reciprocalRankFusion([
      [{ id: "s", score: 0.9, metadata: { source: "a" } }],
      [{ id: "s", score: 3.1, metadata: { source: "a", requiredRole: "hr" } }],
    ]);
    expect(visible(fused, ["intern"])).toEqual([]);
    expect(visible(fused, ["hr"])).toEqual(["s"]);
    expect(fused[0].metadata).toEqual({ source: "a" });
  });

  it("different restrictions on two copies are both required", () => {
    const fused = reciprocalRankFusion([
      [{ id: "s", score: 1, acl: ["hr"] }],
      [{ id: "s", score: 1, acl: ["finance"] }],
    ]);
    expect(visible(fused, ["hr"])).toEqual([]);
    expect(visible(fused, ["finance"])).toEqual([]);
    expect(visible(fused, ["hr", "finance"])).toEqual(["s"]);
  });

  it("more restrictions than a result can hold fail closed", () => {
    const fused = reciprocalRankFusion([
      [{ id: "s", score: 1, acl: ["a", "x"], requiredRole: ["b", "x"] }],
      [{ id: "s", score: 1, acl: ["c", "x"] }],
      [{ id: "s", score: 1, acl: ["d", "y"] }],
    ]);
    // Every restriction must be met; no single role meets all four.
    expect(fused[0].acl).toEqual(["rag:no-access"]);
    expect(fused[0]).not.toHaveProperty("requiredRole");
    for (const [_how, copy] of Object.entries(copies(fused))) {
      expect(visible(copy, ["x"])).toEqual([]);
      expect(visible(copy, ["a", "b", "c", "d"])).toEqual([]);
      expect(visible(copy, ["rag:no-access"])).toEqual([]);
    }
  });

  it("restrictions that fit no single list keep the roles they share", () => {
    const fused = reciprocalRankFusion([
      [{ id: "s", score: 1, acl: ["a", "x"], requiredRole: ["b", "x"] }],
      [{ id: "s", score: 1, acl: ["c", "x"] }],
    ]);
    expect(fused[0].acl).toEqual(["x"]);
    for (const [_how, copy] of Object.entries(copies(fused))) {
      expect(visible(copy, ["x"])).toEqual(["s"]);
      expect(visible(copy, ["a", "b", "c"])).toEqual([]);
    }
  });

  it("identical restrictions and unrestricted copies change nothing", () => {
    const first = { id: "s", score: 1, content: "x", acl: ["hr"] };
    const fused = reciprocalRankFusion([
      [first],
      [{ id: "s", score: 1, content: "x", metadata: { acl: ["hr"] } }],
      [{ id: "s", score: 1, content: "x" }],
    ]);
    const { score: _score, ...fields } = first;
    expect(fused[0]).toEqual({ ...fields, score: fused[0].score });
    expect(visible(fused, ["hr"])).toEqual(["s"]);
  });
});
