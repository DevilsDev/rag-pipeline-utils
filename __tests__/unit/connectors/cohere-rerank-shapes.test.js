"use strict";

const { CohereConnector } = require("../../../src/connectors/cohere-connector");

function connectorReplying(data) {
  const c = new CohereConnector({ apiKey: "co-test-key", maxRetries: 0 });
  c.client = { post: jest.fn(async () => ({ data })) };
  return c;
}

describe("CohereConnector.rerank result shapes", () => {
  test("string documents come back as objects with content and relevanceScore", async () => {
    const c = connectorReplying({
      results: [
        { index: 1, relevance_score: 0.9 },
        { index: 0, relevance_score: 0.2 },
      ],
    });
    const out = await c.rerank("q", ["hello", "hi"]);
    expect(out).toEqual([
      { content: "hi", relevanceScore: 0.9 },
      { content: "hello", relevanceScore: 0.2 },
    ]);
  });

  test("object documents keep their own score and gain relevanceScore", async () => {
    const c = connectorReplying({
      results: [{ index: 0, relevance_score: 0.8 }],
    });
    const [r] = await c.rerank("q", [
      { id: "a", content: "x", score: 0.42, acl: ["hr"] },
    ]);
    expect(r).toEqual({
      id: "a",
      content: "x",
      score: 0.42,
      acl: ["hr"],
      relevanceScore: 0.8,
    });
  });

  test("an empty response gives a clear error", async () => {
    const c = connectorReplying({});
    await expect(c.rerank("q", ["a"])).rejects.toThrow(/Cohere.*rerank/i);
  });

  test("an empty embed response gives a clear error", async () => {
    const c = connectorReplying({});
    await expect(c.embed("x")).rejects.toThrow(/Cohere.*embed/i);
    await expect(c.embedQuery("x")).rejects.toThrow(/Cohere.*embed/i);
  });
});
