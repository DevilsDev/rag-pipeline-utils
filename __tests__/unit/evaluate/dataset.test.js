"use strict";

const { validateDataset } = require("../../../src/evaluate/dataset");

const messages = (list) => list.map((e) => e.message);

describe("validateDataset", () => {
  it("accepts the { prompt, expected } shape evaluateRagDataset reads", () => {
    const result = validateDataset([
      { prompt: "What is a vector database?", expected: "A database." },
      { prompt: "What is RAG?", expected: "Retrieval-augmented generation." },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.cases).toEqual([
      {
        id: "case-1",
        prompt: "What is a vector database?",
        expected: "A database.",
      },
      {
        id: "case-2",
        prompt: "What is RAG?",
        expected: "Retrieval-augmented generation.",
      },
    ]);
  });

  it("resolves aliases, keeps extra fields and accepts { cases }", () => {
    const result = validateDataset({
      version: 1,
      cases: [
        {
          id: 7,
          question: "How many vacation days?",
          referenceAnswer: "Twenty.",
          sourceIds: ["vacation", 3],
          tags: ["hr"],
          category: "policy",
        },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.cases[0]).toEqual({
      id: "7",
      prompt: "How many vacation days?",
      expected: "Twenty.",
      sourceIds: ["vacation", "3"],
      tags: ["hr"],
      category: "policy",
    });
  });

  it("rejects input that is not a list of cases", () => {
    for (const input of [undefined, null, "cases", 3, {}, { cases: "x" }]) {
      const result = validateDataset(input);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatchObject({ index: null, field: null });
    }
    expect(messages(validateDataset([]).errors)).toEqual([
      "The dataset has no cases",
    ]);
  });

  it("reports every problem with its case, without throwing", () => {
    const result = validateDataset([
      { prompt: "ok", expected: "fine" },
      "not an object",
      { expected: "no prompt" },
      { prompt: "  ", sourceIds: "vacation" },
      { id: "case-1", prompt: "dup id", tags: [1] },
      { prompt: "a", question: "b" },
      { prompt: "c", expected: "" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.cases).toEqual([]);
    expect(result.errors.map(({ index, field }) => [index, field])).toEqual([
      [1, null],
      [2, "prompt"],
      [3, "prompt"],
      [3, "sourceIds"],
      [4, "id"],
      [4, "tags"],
      [5, "prompt"],
      [6, "expected"],
    ]);
    expect(result.errors[4].message).toBe(
      'Case 5: id "case-1" is also used by case 1',
    );
    expect(result.errors[6].message).toBe(
      'Case 6: "prompt" and "question" are both set and differ; use one',
    );
  });

  it("warns about likely mistakes without failing", () => {
    const result = validateDataset([
      { prompt: "What is RAG?", sourceIds: [] },
      { prompt: "what is rag? ", sourceIds: ["a", "a"] },
    ]);
    expect(result.valid).toBe(true);
    expect(result.warnings.map((w) => [w.index, w.field])).toEqual([
      [0, "sourceIds"],
      [1, "prompt"],
      [1, "sourceIds"],
    ]);
    expect(result.cases[1].sourceIds).toEqual(["a"]);
  });

  it("can require reference answers and source ids", () => {
    const dataset = [{ prompt: "What is RAG?" }];
    expect(validateDataset(dataset).valid).toBe(true);
    const strict = validateDataset(dataset, {
      requireExpected: true,
      requireSourceIds: true,
    });
    expect(strict.errors.map((e) => e.field)).toEqual([
      "expected",
      "sourceIds",
    ]);
  });

  it("is exported from the package entry", () => {
    // jest.setup.js resets modules between tests, so require both here.
    const entry = require("../../../src/index.js");
    const own = require("../../../src/evaluate/dataset");
    expect(entry.validateDataset).toBe(own.validateDataset);
  });
});
