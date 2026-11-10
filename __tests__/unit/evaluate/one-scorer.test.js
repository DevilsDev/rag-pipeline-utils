/**
 * checkAnswer, CitationTracker, computeFaithfulness and PipelineEvaluator
 * (with or without a citation result) score a sentence the same way.
 */

const { checkAnswer } = require("../../../src/grounding/check-answer");
const { CitationTracker } = require("../../../src/citation/citation-tracker");
const { computeFaithfulness } = require("../../../src/evaluate/faithfulness");
const {
  PipelineEvaluator,
} = require("../../../src/evaluate/pipeline-evaluator");

const cafeteria = [
  { id: "a", content: "The cafeteria serves lunch to employees on weekdays." },
];

describe("one scorer for every entry point", () => {
  test.each([
    ["Lunch is free.", cafeteria],
    ["Lunch is served on Saturdays.", cafeteria],
    [
      "Employees receive twenty days of paid vacation per year.",
      [
        { id: "a", content: "Employees receive twenty days of paid vacation." },
        { id: "b", content: "Contractors receive no paid vacation." },
        { id: "c", content: "Vacation requests go to your manager." },
      ],
    ],
  ])("%j gets one verdict", async (answer, docs) => {
    const check = await checkAnswer({ answer, sources: docs });
    const faithful = computeFaithfulness(answer, docs).details[0].isFaithful;
    const evaluator = new PipelineEvaluator();
    const plain = evaluator.evaluate({ query: "q", answer, results: docs });
    const cited = evaluator.evaluate(
      { query: "q", answer, results: docs },
      { citationResult: new CitationTracker().track(answer, docs) },
    );
    expect(faithful).toBe(check.grounded);
    expect(check.evaluation.scores.faithfulness).toBe(check.grounded ? 1 : 0);
    expect(plain.scores.faithfulness).toBe(cited.scores.faithfulness);
    expect(plain.details.groundedness.components.faithfulness.score).toBe(
      cited.scores.faithfulness,
    );
  });
});
