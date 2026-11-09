"use strict";

const { GraphRetriever } = require("../../../src/graph/graph-retriever");

describe("GraphRetriever.store", () => {
  test("a second store() keeps the first documents reachable through shared entities", async () => {
    const g = new GraphRetriever();
    await g.store([
      { id: "d1", content: "Alice Smith works at Acme Corp in Berlin." },
    ]);
    await g.store([
      { id: "d2", content: "Bob Jones met Alice Smith at a conference." },
    ]);
    expect(g.graph.getEntity("alice_smith").properties.sources).toEqual([
      "d1",
      "d2",
    ]);
    const ids = (await g.retrieve("Alice Smith")).map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(["d1", "d2"]));
  });

  test("documents without an id each get their own id and credit", async () => {
    const g = new GraphRetriever();
    await g.store([
      { content: "Alice Smith works at Acme Corp." },
      { content: "Bob Jones lives in Paris." },
    ]);
    const stored = [...g.documents.keys()];
    expect(stored).toHaveLength(2);
    const sourcesOf = (id) => g.graph.getEntity(id).properties.sources;
    expect(sourcesOf("alice_smith")).toEqual([stored[0]]);
    expect(sourcesOf("bob_jones")).toEqual([stored[1]]);
    const alice = (await g.retrieve("Alice Smith"))[0];
    const bob = (await g.retrieve("Bob Jones"))[0];
    expect(alice.id).toBe(stored[0]);
    expect(bob.id).toBe(stored[1]);
    expect(alice.content).toContain("Alice");
    expect(bob.content).toContain("Bob");
  });

  test("ids of id-less documents continue across store() calls", async () => {
    const g = new GraphRetriever();
    await g.store([{ content: "Alice Smith works at Acme Corp." }]);
    await g.store([{ content: "Bob Jones lives in Paris." }]);
    expect(g.documents.size).toBe(2);
    expect((await g.retrieve("Alice Smith"))[0].content).toContain("Alice");
    expect((await g.retrieve("Bob Jones"))[0].content).toContain("Bob");
  });
});
