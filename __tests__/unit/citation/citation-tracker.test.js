"use strict";

const {
  CitationTracker,
  DEFAULT_CONFIG,
} = require("../../../src/citation/citation-tracker");
const {
  mapSentenceToSources,
  buildIDFWeights,
} = require("../../../src/citation/source-mapper");
const {
  detectHallucinations,
} = require("../../../src/citation/hallucination-detector");

describe("CitationTracker", () => {
  let tracker;

  beforeEach(() => {
    tracker = new CitationTracker();
  });

  describe("Constructor", () => {
    test("creates with default configuration", () => {
      expect(tracker.config.similarityThreshold).toBe(0.3);
      expect(tracker.config.maxCitationsPerSentence).toBe(3);
      expect(tracker.config.useIDFWeighting).toBe(true);
    });

    test("accepts custom options", () => {
      const custom = new CitationTracker({
        similarityThreshold: 0.5,
        useIDFWeighting: false,
      });
      expect(custom.config.similarityThreshold).toBe(0.5);
      expect(custom.config.useIDFWeighting).toBe(false);
      expect(custom.config.maxCitationsPerSentence).toBe(3); // default preserved
    });
  });

  describe("track()", () => {
    test("returns citations array, groundednessScore, and hallucinationReport", () => {
      const answer = "The cat sat on the mat.";
      const docs = [{ content: "The cat sat on the mat in the living room." }];
      const result = tracker.track(answer, docs);

      expect(result).toHaveProperty("citations");
      expect(result).toHaveProperty("groundednessScore");
      expect(result).toHaveProperty("hallucinationReport");
      expect(result).toHaveProperty("metadata");
      expect(Array.isArray(result.citations)).toBe(true);
      expect(typeof result.groundednessScore).toBe("number");
    });

    test("throws on empty answer", () => {
      expect(() => tracker.track("", [{ content: "doc" }])).toThrow(
        "answer must be a non-empty string",
      );
    });

    test("throws on null answer", () => {
      expect(() => tracker.track(null, [{ content: "doc" }])).toThrow(
        "answer must be a non-empty string",
      );
    });

    test("throws on empty docs array", () => {
      expect(() => tracker.track("Some answer.", [])).toThrow(
        "retrievedDocs must be a non-empty array",
      );
    });

    test("throws when docs is not an array", () => {
      expect(() => tracker.track("Some answer.", "not-an-array")).toThrow(
        "retrievedDocs must be a non-empty array",
      );
    });
  });

  describe("Grounded answer", () => {
    test("answer fully supported by docs yields high groundedness", () => {
      const answer =
        "Python is a programming language used for web development and data science.";
      const docs = [
        {
          content:
            "Python is a versatile programming language widely used for web development, data science, and machine learning.",
        },
      ];
      const result = tracker.track(answer, docs);
      expect(result.groundednessScore).toBeGreaterThanOrEqual(0.5);
      expect(result.hallucinationReport.hallucinationRate).toBeLessThan(0.5);
    });
  });

  describe("Hallucinated answer", () => {
    test("answer not in any doc yields low groundedness and hallucinations detected", () => {
      const answer =
        "Quantum teleportation enables faster than light communication across galaxies.";
      const docs = [
        {
          content:
            "The weather forecast predicts sunny skies and mild temperatures this weekend.",
        },
      ];
      const result = tracker.track(answer, docs);
      expect(result.groundednessScore).toBeLessThanOrEqual(0.5);
      expect(result.hallucinationReport.hallucinationRate).toBeGreaterThan(0);
    });
  });

  describe("Mixed answer", () => {
    test("partially grounded answer yields intermediate score", () => {
      const answer =
        "JavaScript runs in browsers. Quantum entanglement defies classical physics.";
      const docs = [
        {
          content:
            "JavaScript is a programming language that runs in web browsers and Node.js environments.",
        },
      ];
      const result = tracker.track(answer, docs);
      // One sentence grounded, one not — score should be partial
      expect(result.groundednessScore).toBeGreaterThan(0);
      expect(result.groundednessScore).toBeLessThan(1);
    });
  });

  describe("Doc normalization", () => {
    test("handles docs with .content field", () => {
      const result = tracker.track("The sky is blue.", [
        { content: "The sky is blue and clear." },
      ]);
      expect(result.citations.length).toBeGreaterThanOrEqual(1);
    });

    test("handles docs with .text field", () => {
      const result = tracker.track("The sky is blue.", [
        { text: "The sky is blue and clear." },
      ]);
      expect(result.citations.length).toBeGreaterThanOrEqual(1);
    });

    test("handles docs that are plain strings by normalizing to empty content", () => {
      // Plain string docs get normalized — .content will be empty string
      const result = tracker.track("Some answer here.", [
        { chunk: "Some answer here in the document." },
      ]);
      expect(result).toHaveProperty("groundednessScore");
    });
  });

  describe("Events", () => {
    test("emits tracked event with result data", () => {
      const handler = jest.fn();
      tracker.on("tracked", handler);

      const answer = "Testing the event system works properly.";
      const docs = [
        {
          content:
            "Testing the event system in our application works properly.",
        },
      ];
      tracker.track(answer, docs);

      expect(handler).toHaveBeenCalledTimes(1);
      const eventData = handler.mock.calls[0][0];
      expect(eventData).toHaveProperty("citations");
      expect(eventData).toHaveProperty("groundednessScore");
      expect(eventData).toHaveProperty("hallucinationReport");
      expect(eventData).toHaveProperty("metadata");
    });
  });
});

describe("mapSentenceToSources", () => {
  test("returns sorted matches with scores", () => {
    const sentence = "Machine learning models process data efficiently.";
    const docs = [
      {
        content:
          "Machine learning models are used to process large amounts of data efficiently.",
      },
      {
        content:
          "Cooking recipes involve mixing ingredients together carefully.",
      },
    ];
    const results = mapSentenceToSources(sentence, docs);
    expect(Array.isArray(results)).toBe(true);
    // The ML doc should score higher than the cooking doc
    if (results.length > 1) {
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    }
  });

  test("returns empty array for empty sentence", () => {
    const results = mapSentenceToSources("", [
      { content: "Some doc content." },
    ]);
    expect(results).toEqual([]);
  });

  test("respects maxCitations option", () => {
    const sentence = "Common words appear in many documents.";
    const docs = [
      { content: "Common words appear in documents and sentences." },
      { content: "Many common words appear across documents." },
      { content: "Words and documents are common in many places." },
      { content: "Documents contain many common words and phrases." },
    ];
    const results = mapSentenceToSources(sentence, docs, {
      maxCitations: 2,
      threshold: 0.0,
    });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  test("respects threshold option by filtering low scores", () => {
    const sentence = "Quantum computing uses qubits.";
    const docs = [{ content: "Cooking pasta requires boiling water." }];
    const results = mapSentenceToSources(sentence, docs, { threshold: 0.5 });
    // Very different topics — should be below threshold
    expect(results.length).toBe(0);
  });

  test("includes docIndex and matched info", () => {
    const sentence = "The quick brown fox jumps over the lazy dog.";
    const docs = [
      {
        content: "A quick brown fox jumped over a lazy dog in the park.",
        id: "doc-1",
      },
    ];
    const results = mapSentenceToSources(sentence, docs, { threshold: 0.0 });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].docIndex).toBe(0);
    expect(results[0].docId).toBe("doc-1");
    expect(typeof results[0].score).toBe("number");
  });
});

describe("buildIDFWeights", () => {
  test("computes IDF weights across documents", () => {
    const docs = [
      { content: "The cat sat on the mat." },
      { content: "The dog ran in the park." },
      { content: "The cat chased the dog." },
    ];
    const weights = buildIDFWeights(docs);
    expect(weights instanceof Map).toBe(true);
    expect(weights.size).toBeGreaterThan(0);
  });

  test("common tokens get lower IDF than rare tokens", () => {
    const docs = [
      { content: "apple banana cherry fruit" },
      { content: "apple banana grape fruit" },
      { content: "apple date elderberry fruit" },
    ];
    const weights = buildIDFWeights(docs);
    // "apple" and "fruit" appear in all 3 docs — IDF = log(3/3) = 0
    // "cherry" appears in 1 doc — IDF = log(3/1) > 0
    const appleIDF = weights.get("apple") || 0;
    const cherryIDF = weights.get("cherry") || 0;
    expect(cherryIDF).toBeGreaterThan(appleIDF);
  });

  test("returns empty map for empty docs array", () => {
    const weights = buildIDFWeights([]);
    expect(weights.size).toBe(0);
  });
});

describe("detectHallucinations", () => {
  test("classifies grounded sentences correctly", () => {
    const citations = [
      { sentence: "Well supported claim.", sources: [{ score: 0.8 }] },
    ];
    const result = detectHallucinations(citations, { threshold: 0.3 });
    expect(result.summary.grounded).toBe(1);
    expect(result.summary.definite_hallucination).toBe(0);
    expect(result.hallucinationRate).toBe(0);
  });

  test("classifies definite hallucination when no sources match", () => {
    const citations = [
      { sentence: "Completely unsupported claim.", sources: [] },
    ];
    const result = detectHallucinations(citations, { threshold: 0.3 });
    expect(result.summary.definite_hallucination).toBe(1);
    expect(result.hallucinationRate).toBe(1);
  });

  test("classifies likely hallucination for low scores below threshold", () => {
    const citations = [
      { sentence: "Weakly supported claim.", sources: [{ score: 0.1 }] },
    ];
    const result = detectHallucinations(citations, { threshold: 0.3 });
    expect(result.summary.likely_hallucination).toBe(1);
  });

  test("returns empty result for empty citations array", () => {
    const result = detectHallucinations([]);
    expect(result.hallucinationRate).toBe(0);
    expect(result.sentences).toEqual([]);
    expect(result.summary.grounded).toBe(0);
  });

  test("handles mixed classifications", () => {
    const citations = [
      { sentence: "Grounded.", sources: [{ score: 0.8 }] },
      { sentence: "Likely hallucinated.", sources: [{ score: 0.1 }] },
      { sentence: "Definitely hallucinated.", sources: [] },
    ];
    const result = detectHallucinations(citations, { threshold: 0.3 });
    expect(result.summary.grounded).toBe(1);
    expect(result.summary.likely_hallucination).toBe(1);
    expect(result.summary.definite_hallucination).toBe(1);
    expect(result.hallucinationRate).toBeCloseTo(2 / 3, 2);
  });
});
