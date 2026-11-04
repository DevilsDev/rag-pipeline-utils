"use strict";

const {
  evaluationScores,
  toLangfuseScores,
} = require("../../../src/observability/scores");
const root = require("../../../src/index.js");
const edge = require("../../../src/edge.js");
const core = require("../../../src/packages/core.js");

const run = {
  success: true,
  answer: "Employees get twenty days.",
  citations: { groundednessScore: 0.5, citations: [] },
  evaluation: {
    scores: {
      faithfulness: 0.9,
      relevance: 0.7,
      contextPrecision: 1,
      contextRecall: null,
      groundedness: 0.8,
      bleu: Number.NaN,
    },
  },
  telemetry: {
    traceId: "a".repeat(32),
    spanId: "1111111111111111",
    spans: { retrieval: "2222222222222222", generation: "3333333333333333" },
  },
};

const check = {
  grounded: false,
  groundedness: 0.5,
  unsupported: ["The office has a pool."],
  citations: [],
  evaluation: { scores: { faithfulness: 0.5 } },
};

describe("evaluationScores", () => {
  test("lists the run's scores under the eval metric names", () => {
    expect(evaluationScores(run)).toEqual([
      { name: "faithfulness", value: 0.9, target: "generation" },
      { name: "relevance", value: 0.7, target: "generation" },
      { name: "contextPrecision", value: 1, target: "retrieval" },
      { name: "groundedness", value: 0.8, target: "generation" },
      { name: "citationCoverage", value: 0.5, target: "generation" },
    ]);
  });

  test("labels a checkAnswer verdict, with explanations only on request", () => {
    expect(evaluationScores(check)).toEqual([
      { name: "faithfulness", value: 0.5, target: "generation" },
      {
        name: "groundedSentences",
        value: 0.5,
        target: "generation",
        label: "ungrounded",
      },
    ]);
    expect(evaluationScores(check, { explanations: true })[1]).toMatchObject({
      explanation: 'Unsupported: "The office has a pool."',
    });
    expect(
      evaluationScores(
        { ...check, grounded: true, unsupported: [] },
        { explanations: true },
      )[1],
    ).toEqual({
      name: "groundedSentences",
      value: 0.5,
      target: "generation",
      label: "grounded",
    });
  });

  test.each([[null], [undefined], ["text"], [{}], [{ success: true }]])(
    "returns nothing for %j",
    (input) => {
      expect(evaluationScores(input)).toEqual([]);
    },
  );
});

describe("toLangfuseScores", () => {
  test("attaches each score to its trace and the span it judges", () => {
    const scores = toLangfuseScores(run);
    expect(scores[0]).toEqual({
      name: "faithfulness",
      value: 0.9,
      dataType: "NUMERIC",
      traceId: "a".repeat(32),
      observationId: "3333333333333333",
    });
    expect(scores.find((s) => s.name === "contextPrecision")).toMatchObject({
      observationId: "2222222222222222",
    });
  });

  test("falls back to the run span when a stage had none", () => {
    const [score] = toLangfuseScores({
      ...run,
      telemetry: { ...run.telemetry, spans: {} },
    });
    expect(score.observationId).toBe("1111111111111111");
  });

  test("an explicit observationId wins; another trace drops the span ids", () => {
    expect(
      toLangfuseScores(run, { observationId: "obs" }).map(
        (s) => s.observationId,
      ),
    ).toEqual(["obs", "obs", "obs", "obs", "obs"]);
    const other = toLangfuseScores(run, {
      traceId: "b".repeat(32),
      sessionId: "s1",
    });
    expect(other[0]).toEqual({
      name: "faithfulness",
      value: 0.9,
      dataType: "NUMERIC",
      traceId: "b".repeat(32),
      sessionId: "s1",
    });
  });

  test("without ids, returns experiment evaluations", () => {
    const scores = toLangfuseScores(check, { comments: true });
    expect(scores).toEqual([
      { name: "faithfulness", value: 0.5, dataType: "NUMERIC" },
      {
        name: "groundedSentences",
        value: 0.5,
        dataType: "NUMERIC",
        comment: 'Unsupported: "The office has a pool."',
        metadata: { label: "ungrounded" },
      },
    ]);
    expect(toLangfuseScores(check)[1]).not.toHaveProperty("comment");
  });
});

test("is exported from the main entry, ./edge and rag-core", () => {
  for (const mod of [root, edge, core]) {
    expect(mod.evaluationScores).toBe(evaluationScores);
    expect(mod.toLangfuseScores).toBe(toLangfuseScores);
  }
});
