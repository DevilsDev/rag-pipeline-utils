"use strict";

/**
 * Behaviour every vector-store retriever must share, run against each one:
 * MemoryRetriever always, and PgVectorRetriever and QdrantRetriever against
 * real databases in the vector-store CI job.
 *
 * `make()` returns a fresh, empty retriever (async is fine). `extended`
 * also checks the CLI's optional methods: size, list and removeBySource.
 */

const unit = (values) => {
  const n = Math.sqrt(values.reduce((s, x) => s + x * x, 0));
  return values.map((x) => x / n);
};

const DOCS = [
  {
    id: "docs/vacation.md#0",
    vector: unit([1, 0, 0, 0]),
    content: "Twenty days of paid vacation.",
    metadata: {
      source: "docs/vacation.md",
      chunk: 0,
      requiredRole: "employee",
    },
  },
  {
    id: "docs/vacation.md#1",
    vector: unit([0.9, 0.1, 0, 0]),
    content: "Unused days carry over.",
    metadata: { source: "docs/vacation.md", chunk: 1 },
  },
  {
    id: "docs/remote.md#0",
    vector: unit([0, 1, 0, 0]),
    content: "Remote work three days a week.",
    metadata: { source: "docs/remote.md", chunk: 0 },
  },
];

function describeRetrieverContract(
  name,
  make,
  { extended = false, cleanup } = {},
) {
  describe(`${name}: retriever contract`, () => {
    let retriever;

    beforeEach(async () => {
      retriever = await make();
    });

    afterEach(async () => {
      if (cleanup) await cleanup(retriever);
    });

    it("returns the closest documents first, with scores, up to topK", async () => {
      await retriever.store(DOCS);
      const results = await retriever.retrieve({
        queryVector: unit([1, 0.05, 0, 0]),
        topK: 2,
      });
      expect(results.map((r) => r.id)).toEqual([
        "docs/vacation.md#0",
        "docs/vacation.md#1",
      ]);
      expect(results[0].score).toBeGreaterThan(results[1].score);
      expect(results[0].score).toBeCloseTo(0.9988, 3);
    });

    it("round-trips content and metadata", async () => {
      await retriever.store(DOCS);
      const [top] = await retriever.retrieve({
        queryVector: DOCS[0].vector,
        topK: 1,
      });
      expect(top).toMatchObject({
        id: "docs/vacation.md#0",
        content: "Twenty days of paid vacation.",
        metadata: {
          source: "docs/vacation.md",
          chunk: 0,
          requiredRole: "employee",
        },
      });
    });

    it("replaces a document stored again under the same id", async () => {
      await retriever.store(DOCS);
      await retriever.store([
        {
          ...DOCS[2],
          vector: unit([1, 0, 0, 0.01]),
          content: "Remote work is now five days a week.",
        },
      ]);
      const results = await retriever.retrieve({
        queryVector: unit([1, 0, 0, 0]),
        topK: 3,
      });
      expect(results.filter((r) => r.id === "docs/remote.md#0")).toHaveLength(
        1,
      );
      expect(results.find((r) => r.id === "docs/remote.md#0").content).toBe(
        "Remote work is now five days a week.",
      );
    });

    it("rejects a vector of another size", async () => {
      await retriever.store(DOCS);
      await expect(
        retriever.store([{ id: "odd", vector: [1, 0, 0], content: "x" }]),
      ).rejects.toThrow(/dimension/i);
    });

    it("stops when the signal is already aborted", async () => {
      await retriever.store(DOCS);
      const controller = new AbortController();
      controller.abort();
      await expect(
        retriever.retrieve({
          queryVector: DOCS[0].vector,
          topK: 1,
          signal: controller.signal,
        }),
      ).rejects.toThrow(/abort/i);
    });

    it("clear() empties the store", async () => {
      await retriever.store(DOCS);
      await retriever.clear();
      expect(
        await retriever.retrieve({ queryVector: DOCS[0].vector, topK: 3 }),
      ).toEqual([]);
    });

    if (extended) {
      it("size(), list() and removeBySource() work for re-ingesting", async () => {
        await retriever.store(DOCS);
        expect(await retriever.size()).toBe(3);
        expect((await retriever.list()).map((d) => d.id).sort()).toEqual(
          DOCS.map((d) => d.id).sort(),
        );
        await retriever.removeBySource("docs/vacation.md");
        expect(await retriever.size()).toBe(1);
        expect((await retriever.list())[0]).toMatchObject({
          id: "docs/remote.md#0",
          content: "Remote work three days a week.",
          metadata: { source: "docs/remote.md" },
        });
      });
    }
  });
}

module.exports = { describeRetrieverContract, DOCS, unit };
