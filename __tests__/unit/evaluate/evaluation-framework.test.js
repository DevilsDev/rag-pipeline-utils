"use strict";

const {
  computeFaithfulness,
  computeFaithfulnessFromCitations,
} = require("../../../src/evaluate/faithfulness");
const { computeAnswerRelevance } = require("../../../src/evaluate/relevance");
const {
  computeContextPrecision,
  computeContextRecall,
} = require("../../../src/evaluate/context-metrics");
const { computeGroundedness } = require("../../../src/evaluate/groundedness");
const {
  PipelineEvaluator,
  DEFAULT_CONFIG,
} = require("../../../src/evaluate/pipeline-evaluator");

describe("computeFaithfulness", () => {
  test("fully supported answer yields score close to 1.0", () => {
    const answer = "Python is used for web development and data science.";
    const docs = [
      {
        content:
          "Python is a programming language used for web development, data science, and machine learning applications.",
      },
    ];
    const result = computeFaithfulness(answer, docs);
    expect(result.score).toBeGreaterThanOrEqual(0.5);
    expect(result.faithfulSentences).toBeGreaterThanOrEqual(1);
  });

  test("unsupported answer yields score close to 0.0", () => {
    const answer =
      "Quantum teleportation enables instantaneous galactic communication.";
    const docs = [
      {
        content:
          "The weather forecast predicts sunny skies and mild temperatures this weekend.",
      },
    ];
    const result = computeFaithfulness(answer, docs);
    expect(result.score).toBeLessThanOrEqual(0.5);
  });

  test("empty answer returns zero score", () => {
    const result = computeFaithfulness("", [{ content: "Some doc." }]);
    expect(result.score).toBe(0);
    expect(result.totalSentences).toBe(0);
  });

  test("empty docs array returns zero score with details", () => {
    const result = computeFaithfulness("Some answer sentence.", []);
    expect(result.score).toBe(0);
    expect(result.totalSentences).toBeGreaterThan(0);
    expect(result.details.every((d) => !d.isFaithful)).toBe(true);
  });

  test("computeFaithfulnessFromCitations reuses citation data", () => {
    const citationResult = {
      groundednessScore: 0.75,
      citations: [{ sentence: "Test sentence.", score: 0.8, sourceIndex: 0 }],
    };
    const result = computeFaithfulnessFromCitations(citationResult);
    expect(result.score).toBe(0.75);
    expect(result.details.length).toBe(1);
  });

  test("computeFaithfulnessFromCitations handles null input", () => {
    const result = computeFaithfulnessFromCitations(null);
    expect(result.score).toBe(0);
    expect(result.details).toEqual([]);
  });
});

describe("computeAnswerRelevance", () => {
  test("relevant answer yields high score", () => {
    const query = "What programming language is best for machine learning?";
    const answer =
      "Python is the best programming language for machine learning due to libraries like TensorFlow and PyTorch.";
    const result = computeAnswerRelevance(query, answer);
    expect(result.score).toBeGreaterThan(0.3);
  });

  test("irrelevant answer yields low score", () => {
    const query = "What programming language is best for machine learning?";
    const answer =
      "The Eiffel Tower is located in Paris and was built in eighteen eighty nine.";
    const result = computeAnswerRelevance(query, answer);
    expect(result.score).toBeLessThan(0.3);
  });

  test("missing query terms are reported", () => {
    const query = "What is the population of Tokyo?";
    const answer = "It is a large city in Japan.";
    const result = computeAnswerRelevance(query, answer);
    expect(result.missingQueryTerms.length).toBeGreaterThan(0);
    expect(result.missingQueryTerms).toContain("population");
  });

  test("empty query returns zero score", () => {
    const result = computeAnswerRelevance("", "Some answer.");
    expect(result.score).toBe(0);
  });

  test("empty answer returns zero score with missing terms", () => {
    const result = computeAnswerRelevance("What about machine learning?", "");
    expect(result.score).toBe(0);
    expect(result.missingQueryTerms.length).toBeGreaterThan(0);
  });
});

describe("computeContextPrecision", () => {
  test("relevant docs yield high precision", () => {
    const query = "machine learning algorithms";
    const docs = [
      {
        content:
          "Machine learning algorithms include decision trees, random forests, and neural networks.",
      },
      {
        content:
          "Deep learning is a subset of machine learning using neural network algorithms.",
      },
    ];
    const result = computeContextPrecision(query, docs);
    expect(result.score).toBeGreaterThan(0.5);
    expect(result.relevantDocs).toBeGreaterThanOrEqual(1);
  });

  test("irrelevant docs yield low precision", () => {
    const query = "machine learning algorithms";
    const docs = [
      { content: "Cooking pasta requires boiling water and adding salt." },
      { content: "The history of ancient Rome spans several centuries." },
    ];
    const result = computeContextPrecision(query, docs);
    expect(result.score).toBeLessThanOrEqual(0.5);
  });

  test("empty query returns zero", () => {
    const result = computeContextPrecision("", [{ content: "Some doc." }]);
    expect(result.score).toBe(0);
    expect(result.totalDocs).toBe(0);
  });

  test("empty docs returns zero", () => {
    const result = computeContextPrecision("query", []);
    expect(result.score).toBe(0);
    expect(result.totalDocs).toBe(0);
  });
});

describe("computeContextRecall", () => {
  test("all claims supported yields high recall", () => {
    const answer =
      "Python supports web development projects. Python supports data science projects.";
    const docs = [
      {
        content:
          "Python supports web development projects and Python supports data science projects extensively.",
      },
    ];
    const result = computeContextRecall(answer, docs);
    expect(result.score).toBeGreaterThanOrEqual(0.5);
    expect(result.supportedClaims).toBeGreaterThanOrEqual(1);
  });

  test("unsupported claims yield low recall", () => {
    const answer =
      "Quantum entanglement enables teleportation. Dark matter composes most of the universe.";
    const docs = [
      { content: "Cooking pasta requires boiling water for ten minutes." },
    ];
    const result = computeContextRecall(answer, docs);
    expect(result.score).toBeLessThanOrEqual(0.5);
  });

  test("empty answer returns zero", () => {
    const result = computeContextRecall("", [{ content: "doc" }]);
    expect(result.score).toBe(0);
    expect(result.totalClaims).toBe(0);
  });

  test("empty docs returns zero with claims counted", () => {
    const result = computeContextRecall("Some claim here.", []);
    expect(result.score).toBe(0);
    expect(result.totalClaims).toBeGreaterThan(0);
  });
});

describe("computeGroundedness", () => {
  test("combines faithfulness, precision, recall with weights", () => {
    const query = "What is Python used for?";
    const answer = "Python is used for web development and data science.";
    const docs = [
      {
        content:
          "Python is a programming language used for web development, data science, and automation.",
      },
    ];
    const result = computeGroundedness(query, answer, docs);
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("components");
    expect(result).toHaveProperty("weights");
    expect(result.components).toHaveProperty("faithfulness");
    expect(result.components).toHaveProperty("contextPrecision");
    expect(result.components).toHaveProperty("contextRecall");
    expect(typeof result.score).toBe("number");
    expect(result.score).toBeGreaterThan(0);
  });

  test("empty inputs produce zero score", () => {
    const result = computeGroundedness("", "", []);
    expect(result.score).toBe(0);
  });

  test("respects custom weights", () => {
    const query = "test query";
    const answer = "Test answer sentence here.";
    const docs = [{ content: "Test answer sentence context here." }];
    const customWeights = {
      faithfulness: 1.0,
      contextPrecision: 0,
      contextRecall: 0,
    };
    const result = computeGroundedness(query, answer, docs, {
      weights: customWeights,
    });
    // Score should equal faithfulness score since other weights are 0
    expect(result.score).toBeCloseTo(result.components.faithfulness.score, 5);
  });
});

describe("PipelineEvaluator", () => {
  let evaluator;

  beforeEach(() => {
    evaluator = new PipelineEvaluator();
  });

  describe("Constructor", () => {
    test("creates with default config", () => {
      expect(evaluator.config.metrics).toEqual(DEFAULT_CONFIG.metrics);
      expect(evaluator.config.threshold).toBe(0.3);
    });

    test("accepts custom metrics list", () => {
      const custom = new PipelineEvaluator({
        metrics: ["faithfulness", "relevance"],
      });
      expect(custom.config.metrics).toEqual(["faithfulness", "relevance"]);
    });
  });

  describe("evaluate()", () => {
    test("runs all configured metrics and returns scores object", () => {
      const pipelineResult = {
        query: "What is Python used for?",
        answer:
          "Python is used for web development and data science applications.",
        results: [
          {
            content:
              "Python is a versatile programming language used for web development, data science, and automation.",
          },
        ],
      };
      const result = evaluator.evaluate(pipelineResult);

      expect(result).toHaveProperty("scores");
      expect(result).toHaveProperty("details");
      expect(result).toHaveProperty("metadata");
      expect(result.metadata.metricsComputed).toEqual(
        expect.arrayContaining([
          "faithfulness",
          "relevance",
          "contextPrecision",
          "contextRecall",
          "groundedness",
        ]),
      );
      expect(typeof result.scores.faithfulness).toBe("number");
      expect(typeof result.scores.relevance).toBe("number");
      expect(typeof result.scores.contextPrecision).toBe("number");
      expect(typeof result.scores.contextRecall).toBe("number");
      expect(typeof result.scores.groundedness).toBe("number");
    });

    test("runs only selected metrics", () => {
      const custom = new PipelineEvaluator({ metrics: ["faithfulness"] });
      const pipelineResult = {
        query: "test",
        answer: "Test answer sentence.",
        results: [{ content: "Test answer context." }],
      };
      const result = custom.evaluate(pipelineResult);
      expect(result.metadata.metricsComputed).toEqual(["faithfulness"]);
      expect(result.scores).toHaveProperty("faithfulness");
      expect(result.scores).not.toHaveProperty("relevance");
    });

    test("uses citation shortcut for faithfulness when citationResult provided", () => {
      const citationResult = {
        groundednessScore: 0.9,
        citations: [{ sentence: "Test.", score: 0.9, sourceIndex: 0 }],
      };
      const custom = new PipelineEvaluator({ metrics: ["faithfulness"] });
      const result = custom.evaluate(
        {
          query: "q",
          answer: "Test.",
          results: [{ content: "Test context." }],
        },
        { citationResult },
      );
      // Should use the citation shortcut score
      expect(result.scores.faithfulness).toBe(0.9);
    });

    test("handles empty/missing pipeline result fields gracefully", () => {
      const result = evaluator.evaluate({});
      expect(result.scores.faithfulness).toBe(0);
      expect(result.scores.relevance).toBe(0);
      expect(result.scores.contextPrecision).toBe(0);
      expect(result.scores.contextRecall).toBe(0);
      expect(result.scores.groundedness).toBe(0);
    });

    test("handles null pipeline result", () => {
      const result = evaluator.evaluate(null);
      expect(result.scores.faithfulness).toBe(0);
    });

    test("includes BLEU score when configured with reference answer", () => {
      const custom = new PipelineEvaluator({ metrics: [], includeBLEU: true });
      const result = custom.evaluate(
        { query: "q", answer: "The answer is here.", results: [] },
        { referenceAnswer: "The answer is here." },
      );
      expect(result.scores).toHaveProperty("bleu");
      expect(result.scores.bleu).toBeGreaterThan(0);
    });

    test("includes ROUGE score when configured with reference answer", () => {
      const custom = new PipelineEvaluator({ metrics: [], includeROUGE: true });
      const result = custom.evaluate(
        { query: "q", answer: "The answer is here.", results: [] },
        { referenceAnswer: "The answer is here." },
      );
      expect(result.scores).toHaveProperty("rouge");
      expect(result.scores.rouge).toBeGreaterThan(0);
    });
  });

  describe("Events", () => {
    test("emits evaluated event with full result", () => {
      const handler = jest.fn();
      evaluator.on("evaluated", handler);

      const pipelineResult = {
        query: "What is testing?",
        answer: "Testing verifies software correctness and quality.",
        results: [
          {
            content:
              "Software testing is the process of verifying correctness and quality.",
          },
        ],
      };
      evaluator.evaluate(pipelineResult);

      expect(handler).toHaveBeenCalledTimes(1);
      const eventData = handler.mock.calls[0][0];
      expect(eventData).toHaveProperty("scores");
      expect(eventData).toHaveProperty("details");
      expect(eventData).toHaveProperty("metadata");
    });

    test("emits evaluated event on each evaluate call", () => {
      const handler = jest.fn();
      evaluator.on("evaluated", handler);

      evaluator.evaluate({
        query: "q1",
        answer: "Answer one here.",
        results: [{ content: "Context one." }],
      });
      evaluator.evaluate({
        query: "q2",
        answer: "Answer two here.",
        results: [{ content: "Context two." }],
      });

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe("Edge cases", () => {
    test("empty strings for all fields return zero scores", () => {
      const result = evaluator.evaluate({ query: "", answer: "", results: [] });
      for (const key of Object.keys(result.scores)) {
        expect(result.scores[key]).toBe(0);
      }
    });

    test("empty doc arrays return zero for doc-dependent metrics", () => {
      const result = evaluator.evaluate({
        query: "test query",
        answer: "Test answer.",
        results: [],
      });
      expect(result.scores.faithfulness).toBe(0);
      expect(result.scores.contextPrecision).toBe(0);
      expect(result.scores.contextRecall).toBe(0);
    });

    test("docs with missing content field are handled", () => {
      const result = evaluator.evaluate({
        query: "test",
        answer: "Test answer sentence.",
        results: [{ text: "Test answer context." }],
      });
      // Should not throw — text field fallback
      expect(typeof result.scores.faithfulness).toBe("number");
    });
  });
});
