"use strict";

const {
  checkAnswer,
  normalizeSources,
} = require("../../../src/grounding/check-answer");

const POLICY =
  "Full-time employees receive twenty days of paid vacation per year.";

describe("normalizeSources", () => {
  test("accepts the shapes common frameworks return", () => {
    const sources = normalizeSources([
      "plain string",
      { id: "doc-1", content: "this library" },
      { pageContent: "LangChain", metadata: { source: "a.md" } },
      { id_: "node-1", text: "LlamaIndex node" },
      {
        node: { id_: "node-2", text: "NodeWithScore", metadata: { p: 1 } },
        score: 0.9,
      },
    ]);
    expect(sources).toEqual([
      { id: "1", content: "plain string", metadata: {} },
      { id: "doc-1", content: "this library", metadata: {} },
      { id: "a.md", content: "LangChain", metadata: { source: "a.md" } },
      { id: "node-1", content: "LlamaIndex node", metadata: {} },
      { id: "node-2", content: "NodeWithScore", metadata: { p: 1 } },
    ]);
  });

  test("drops empty sources and rejects non-arrays", () => {
    expect(normalizeSources(["", null, { content: "  " }, "kept"])).toEqual([
      { id: "4", content: "kept", metadata: {} },
    ]);
    expect(() => normalizeSources("text")).toThrow(/must be an array/);
  });
});

describe("checkAnswer", () => {
  const sources = [
    { pageContent: POLICY, metadata: { source: "handbook.md" } },
  ];

  test("a supported answer is grounded, with citations and scores", async () => {
    const check = await checkAnswer({
      question: "How many vacation days do I get?",
      answer: POLICY,
      sources,
    });
    expect(check.grounded).toBe(true);
    expect(check.groundedness).toBe(1);
    expect(check.unsupported).toEqual([]);
    expect(check.citations[0].sources[0].docId).toBe("handbook.md");
    expect(check.evaluation.scores.faithfulness).toBe(1);
  });

  test("a wrong number and an invented fact are unsupported", async () => {
    const check = await checkAnswer({
      answer:
        "Full-time employees receive thirty days of paid vacation per year. The office is in Paris.",
      sources,
      evaluate: false,
    });
    expect(check.grounded).toBe(false);
    expect(check.groundedness).toBe(0);
    expect(check.unsupported).toHaveLength(2);
    expect(check.evaluation).toBeUndefined();
  });

  test("a partly supported answer lists only the unsupported sentence", async () => {
    const check = await checkAnswer({
      answer: `${POLICY} Employees may also work from the moon.`,
      sources,
      evaluate: false,
    });
    expect(check.grounded).toBe(false);
    expect(check.groundedness).toBeCloseTo(0.5, 5);
    expect(check.unsupported).toEqual([
      "Employees may also work from the moon.",
    ]);
  });

  test("context recall needs a reference answer", async () => {
    const without = await checkAnswer({
      question: "q",
      answer: POLICY,
      sources,
    });
    expect(without.evaluation.scores).not.toHaveProperty("contextRecall");
    const withRef = await checkAnswer({
      question: "q",
      answer: POLICY,
      sources,
      referenceAnswer: "Twenty days of paid vacation per year.",
    });
    expect(withRef.evaluation.scores.contextRecall).toBeGreaterThan(0);
  });

  test("an empty answer is not grounded; bad input is rejected", async () => {
    expect(
      (await checkAnswer({ answer: "", sources, evaluate: false })).grounded,
    ).toBe(false);
    await expect(checkAnswer({ answer: 42, sources })).rejects.toThrow(
      /answer must be a string/,
    );
  });
});
