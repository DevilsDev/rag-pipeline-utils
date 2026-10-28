const { RetrievalGuard } = require("../../../src/guardrails/retrieval-guard");
const { MemoryRetriever } = require("../../../src/connectors/memory-retriever");

describe("RetrievalGuard ACL sources", () => {
  const guard = new RetrievalGuard({ enforceACL: true });

  test("enforces acl stored in metadata by MemoryRetriever", async () => {
    const retriever = new MemoryRetriever();
    await retriever.store([
      {
        id: "secret",
        content: "salaries",
        vector: [1, 0],
        metadata: { acl: ["hr"] },
      },
      { id: "open", content: "vacation", vector: [0.9, 0.1], metadata: {} },
    ]);
    const hits = await retriever.retrieve({ queryVector: [1, 0], topK: 5 });
    const output = guard.filter(hits, { userPermissions: ["staff"] });
    expect(output.results.map((r) => r.id)).toEqual(["open"]);
  });

  test("enforces a top-level acl even when the result has metadata", () => {
    const output = guard.filter(
      [{ id: "secret", score: 0.9, acl: ["hr"], metadata: { source: "a.md" } }],
      { userPermissions: ["staff"] },
    );
    expect(output.results).toEqual([]);
    expect(output.metadata.reasons.acl).toBe(1);
  });
});
