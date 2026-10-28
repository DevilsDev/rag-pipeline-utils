/**
 * Regression: every grounding metric used Jaccard similarity between a
 * sentence and the whole document, so an answer copied verbatim from a normal
 * ~70-word chunk scored 0 everywhere. These tests pin the end-to-end
 * behaviour on realistic chunk sizes.
 */

const { CitationTracker } = require("../../../src/citation/citation-tracker");
const {
  PipelineEvaluator,
} = require("../../../src/evaluate/pipeline-evaluator");
const {
  PostGenerationGuard,
} = require("../../../src/guardrails/post-generation-guard");
const { SelfCritiqueChecker } = require("../../../src/agentic/self-critique");
const { AgenticPipeline } = require("../../../src/agentic/agentic-pipeline");
const { tokenize } = require("../../../src/evaluate/scoring");

const CHUNK = `Full-time employees receive twenty days of paid vacation per year,
accrued monthly. Unused vacation days may be carried over to the next calendar
year, up to a maximum of five days. Requests must be submitted through the HR
portal at least two weeks in advance and approved by a direct manager. Part-time
employees accrue vacation in proportion to their scheduled hours. Vacation cannot
be taken during the first ninety days of employment.`;

const DOCS = [
  { id: "vacation-policy", content: CHUNK },
  {
    id: "cafeteria",
    content: "The cafeteria serves lunch from noon on weekdays.",
  },
];
const QUERY = "How many unused vacation days can be carried over?";
const VERBATIM =
  "Unused vacation days may be carried over to the next calendar year, up to a maximum of five days.";
const UNRELATED =
  "Our stock price rose sharply after the quarterly earnings call.";

describe("grounding metrics on realistic chunks", () => {
  test("chunk is a realistic size", () => {
    expect(tokenize(CHUNK).length).toBeGreaterThan(60);
  });

  test("CitationTracker grounds a verbatim answer and flags an unrelated one", () => {
    const tracker = new CitationTracker();

    const grounded = tracker.track(VERBATIM, DOCS);
    expect(grounded.groundednessScore).toBe(1);
    expect(grounded.citations[0].sources[0].docId).toBe("vacation-policy");

    expect(tracker.track(UNRELATED, DOCS).groundednessScore).toBe(0);
  });

  test("a paraphrase is still grounded", () => {
    const result = new CitationTracker().track(
      "You can carry over up to five unused vacation days into the next year.",
      DOCS,
    );
    expect(result.groundednessScore).toBe(1);
  });

  test("PipelineEvaluator gives a verbatim answer non-zero faithfulness and recall", () => {
    const evaluator = new PipelineEvaluator();

    const good = evaluator.evaluate({
      query: QUERY,
      answer: VERBATIM,
      results: DOCS,
    });
    expect(good.scores.faithfulness).toBe(1);
    expect(good.scores.contextRecall).toBe(1);
    expect(good.scores.contextPrecision).toBeGreaterThan(0);
    expect(good.details.faithfulness.details[0].isFaithful).toBe(true);

    const bad = evaluator.evaluate({
      query: QUERY,
      answer: UNRELATED,
      results: DOCS,
    });
    expect(bad.scores.faithfulness).toBe(0);
    expect(bad.scores.contextRecall).toBe(0);
  });

  test("faithfulness details from citations agree with the headline score", () => {
    const tracker = new CitationTracker();
    const citationResult = tracker.track(`${VERBATIM} ${UNRELATED}`, DOCS);
    const result = new PipelineEvaluator().evaluate(
      { query: QUERY, answer: `${VERBATIM} ${UNRELATED}`, results: DOCS },
      { citationResult },
    );

    expect(result.scores.faithfulness).toBe(0.5);
    expect(
      result.details.faithfulness.details.map((d) => d.isFaithful),
    ).toEqual([true, false]);
    expect(result.details.faithfulness.details[0].bestSource).toBe(0);
  });

  test("PostGenerationGuard raises no groundedness issue for a verbatim answer", () => {
    const guard = new PostGenerationGuard();

    expect(guard.check(VERBATIM, DOCS).safe).toBe(true);
    expect(guard.check(UNRELATED, DOCS).issues.join(" ")).toMatch(
      /Groundedness/,
    );
  });

  test("SelfCritiqueChecker approves a verbatim answer and rejects an unrelated one", () => {
    const checker = new SelfCritiqueChecker();

    expect(checker.check(VERBATIM, DOCS).approved).toBe(true);
    expect(checker.check(UNRELATED, DOCS).approved).toBe(false);
  });

  test("AgenticPipeline generates once when the answer is grounded", async () => {
    jest.useRealTimers();
    const llm = { generate: jest.fn(async () => VERBATIM) };
    const pipeline = new AgenticPipeline({ enablePlanning: false });

    const result = await pipeline.run({
      query: QUERY,
      retriever: { retrieve: async () => DOCS },
      llm,
    });

    expect(result.success).toBe(true);
    expect(llm.generate).toHaveBeenCalledTimes(1);
  });
});
