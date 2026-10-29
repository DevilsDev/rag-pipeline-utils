"use strict";

const {
  computeSemanticSimilarity,
} = require("../../../src/evaluate/semantic-similarity");
const { checkAnswer } = require("../../../src/grounding/check-answer");
const { HashEmbedder } = require("../../../src/testing");

const REFERENCE = "Employees get twenty days of paid vacation per year.";

describe("computeSemanticSimilarity", () => {
  const embedder = new HashEmbedder();

  test("identical text scores 1; a reworded answer beats an unrelated one", async () => {
    expect(
      await computeSemanticSimilarity(REFERENCE, REFERENCE, { embedder }),
    ).toBeCloseTo(1, 10);
    const reworded = await computeSemanticSimilarity(
      "You receive twenty vacation days each year.",
      REFERENCE,
      { embedder },
    );
    const unrelated = await computeSemanticSimilarity(
      "Submit receipts within thirty days.",
      REFERENCE,
      { embedder },
    );
    expect(reworded).toBeGreaterThan(unrelated);
    expect(unrelated).toBeGreaterThanOrEqual(0);
  });

  test("uses embedQuery when present, else embed, and passes the signal", async () => {
    const seen = [];
    const controller = new AbortController();
    const onlyEmbed = {
      embed: async (text, { signal }) => {
        seen.push(signal);
        return text.length > 5 ? [1, 0] : [0, 1];
      },
    };
    await expect(
      computeSemanticSimilarity("long text", "longer text", {
        embedder: onlyEmbed,
        signal: controller.signal,
      }),
    ).resolves.toBe(1);
    expect(seen).toEqual([controller.signal, controller.signal]);
  });

  test("clamps negative similarity to 0 and handles empty text", async () => {
    const opposite = {
      embedQuery: async (t) => (t === "a" ? [1, 0] : [-1, 0]),
    };
    expect(
      await computeSemanticSimilarity("a", "b", { embedder: opposite }),
    ).toBe(0);
    expect(await computeSemanticSimilarity("", REFERENCE, { embedder })).toBe(
      0,
    );
  });

  test("rejects bad input with clear errors", async () => {
    await expect(computeSemanticSimilarity("a", "b", {})).rejects.toThrow(
      /needs an embedder/,
    );
    await expect(
      computeSemanticSimilarity(1, "b", { embedder }),
    ).rejects.toThrow(/must be strings/);
    const mismatched = { embed: async (t) => (t === "a" ? [1, 0] : [1, 0, 0]) };
    await expect(
      computeSemanticSimilarity("a", "b", { embedder: mismatched }),
    ).rejects.toThrow(/same length/);
  });

  test("checkAnswer adds it when given a reference answer and an embedder", async () => {
    const check = await checkAnswer({
      question: "q",
      answer: REFERENCE,
      sources: [REFERENCE],
      referenceAnswer: REFERENCE,
      embedder,
    });
    expect(check.evaluation.scores.semanticSimilarity).toBeCloseTo(1, 10);

    const without = await checkAnswer({
      question: "q",
      answer: REFERENCE,
      sources: [REFERENCE],
      referenceAnswer: REFERENCE,
    });
    expect(without.evaluation.scores).not.toHaveProperty("semanticSimilarity");
  });
});
