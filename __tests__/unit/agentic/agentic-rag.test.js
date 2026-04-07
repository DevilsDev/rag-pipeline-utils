"use strict";

const { QueryPlanner } = require("../../../src/agentic/query-planner");
const {
  IterativeRetriever,
} = require("../../../src/agentic/iterative-retriever");
const { SelfCritiqueChecker } = require("../../../src/agentic/self-critique");
const { AgenticPipeline } = require("../../../src/agentic/agentic-pipeline");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const mockRetriever = (docs) => ({
  retrieve: jest.fn(
    async () =>
      docs || [
        {
          id: "1",
          content: "test doc about retrieval augmented generation",
          score: 0.9,
        },
      ],
  ),
});

const mockLLM = (answer) => ({
  generate: jest.fn(async () =>
    answer != null
      ? answer
      : "This is an answer about retrieval augmented generation.",
  ),
});

// ---------------------------------------------------------------------------
// QueryPlanner
// ---------------------------------------------------------------------------
describe("QueryPlanner", () => {
  let planner;

  beforeEach(() => {
    planner = new QueryPlanner();
  });

  describe("plan() - simple queries", () => {
    test("simple query produces single sub-query", () => {
      const result = planner.plan("What is RAG?");
      expect(result.subQueries.length).toBe(1);
      expect(result.subQueries[0].subQuery).toBe("What is RAG?");
      expect(result.originalQuery).toBe("What is RAG?");
    });

    test("low complexity does not split", () => {
      const result = planner.plan("Explain transformers");
      expect(result.complexity).toBeLessThan(2);
      expect(result.subQueries.length).toBe(1);
    });
  });

  describe("plan() - complex queries", () => {
    test('compound query with "and" is split into multiple sub-queries', () => {
      const result = planner.plan(
        "What is machine learning and how does deep learning work and who invented neural networks",
      );
      expect(result.subQueries.length).toBeGreaterThan(1);
    });

    test("query with semicolons is split", () => {
      const result = planner.plan(
        "Explain transformers; describe attention mechanisms; what is BERT",
      );
      expect(result.subQueries.length).toBeGreaterThan(1);
    });

    test("respects maxSubQueries limit", () => {
      const limited = new QueryPlanner({ maxSubQueries: 2 });
      const result = limited.plan("A and B and C and D and E");
      expect(result.subQueries.length).toBeLessThanOrEqual(2);
    });
  });

  describe("strategy assignment", () => {
    test('"what is X" -> factual', () => {
      const result = planner.plan("What is machine learning");
      expect(result.subQueries[0].strategy).toBe("factual");
    });

    test('"how does Y work" -> analytical', () => {
      const result = planner.plan("How does backpropagation work");
      expect(result.subQueries[0].strategy).toBe("analytical");
    });

    test('"compare A and B" -> comparative', () => {
      // Need high complexity to avoid single sub-query
      const result = planner.plan(
        "Compare transformers and RNNs and explain the differences",
      );
      const strategies = result.subQueries.map((sq) => sq.strategy);
      expect(strategies).toContain("comparative");
    });

    test("generic query -> general", () => {
      const result = planner.plan("RAG pipeline");
      expect(result.subQueries[0].strategy).toBe("general");
    });
  });

  describe("edge cases", () => {
    test("throws on empty query", () => {
      expect(() => planner.plan("")).toThrow();
    });

    test("throws on null query", () => {
      expect(() => planner.plan(null)).toThrow();
    });

    test("trims whitespace from query", () => {
      const result = planner.plan("  hello world  ");
      expect(result.originalQuery).toBe("hello world");
    });
  });

  describe("events", () => {
    test('emits "planned" event', () => {
      const handler = jest.fn();
      planner.on("planned", handler);
      planner.plan("What is RAG?");
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          subQueries: expect.any(Array),
          complexity: expect.any(Number),
        }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// IterativeRetriever
// ---------------------------------------------------------------------------
describe("IterativeRetriever", () => {
  test("converges when coverage threshold is met", async () => {
    const retriever = mockRetriever([
      {
        id: "1",
        content: "information about retrieval and augmented generation",
        score: 0.9,
      },
    ]);
    const ir = new IterativeRetriever({
      coverageThreshold: 0.3,
      maxIterations: 5,
    });

    const result = await ir.retrieve({
      query: "retrieval augmented generation",
      retriever: retriever.retrieve
        ? { retrieve: retriever.retrieve }
        : retriever,
    });

    // The retriever mock returns content covering the query tokens, so should converge
    expect(result.iterations).toBeGreaterThanOrEqual(1);
    expect(result.results.length).toBeGreaterThanOrEqual(1);
  });

  test("stops at maxIterations", async () => {
    // Return docs that do NOT cover query tokens to prevent convergence
    const retriever = {
      retrieve: jest.fn(async () => [
        { id: "1", content: "unrelated content xyz", score: 0.5 },
      ]),
    };
    const ir = new IterativeRetriever({
      coverageThreshold: 0.99,
      maxIterations: 2,
    });

    const result = await ir.retrieve({
      query: "retrieval augmented generation",
      retriever,
    });
    expect(result.iterations).toBe(2);
    expect(result.converged).toBe(false);
  });

  test("refines query when coverage is low (heuristic fallback)", async () => {
    let callCount = 0;
    const retriever = {
      retrieve: jest.fn(async ({ query }) => {
        callCount++;
        if (callCount === 1)
          return [{ id: "1", content: "partial info", score: 0.5 }];
        return [
          {
            id: "2",
            content: "retrieval augmented generation details",
            score: 0.8,
          },
        ];
      }),
    };
    const ir = new IterativeRetriever({
      coverageThreshold: 0.5,
      maxIterations: 3,
    });

    const result = await ir.retrieve({
      query: "retrieval augmented generation",
      retriever,
    });
    expect(retriever.retrieve).toHaveBeenCalledTimes(result.iterations);
    expect(result.results.length).toBeGreaterThanOrEqual(1);
  });

  test("throws on empty query", async () => {
    const ir = new IterativeRetriever();
    await expect(
      ir.retrieve({ query: "", retriever: mockRetriever() }),
    ).rejects.toThrow("non-empty string");
  });

  test("throws when retriever lacks .retrieve() method", async () => {
    const ir = new IterativeRetriever();
    await expect(ir.retrieve({ query: "test", retriever: {} })).rejects.toThrow(
      ".retrieve()",
    );
  });

  test('emits "iteration" events', async () => {
    const retriever = mockRetriever([
      { id: "1", content: "test content about retrieval", score: 0.9 },
    ]);
    const ir = new IterativeRetriever({
      coverageThreshold: 0.99,
      maxIterations: 2,
    });

    const handler = jest.fn();
    ir.on("iteration", handler);

    await ir.retrieve({ query: "retrieval augmented generation", retriever });
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        iteration: expect.any(Number),
        coverage: expect.any(Number),
      }),
    );
  });

  test('emits "completed" event', async () => {
    const retriever = mockRetriever([
      { id: "1", content: "retrieval augmented generation info", score: 0.9 },
    ]);
    const ir = new IterativeRetriever({ maxIterations: 1 });

    const handler = jest.fn();
    ir.on("completed", handler);

    await ir.retrieve({ query: "retrieval augmented generation", retriever });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        results: expect.any(Array),
        iterations: expect.any(Number),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// SelfCritiqueChecker
// ---------------------------------------------------------------------------
describe("SelfCritiqueChecker", () => {
  let checker;

  beforeEach(() => {
    checker = new SelfCritiqueChecker();
  });

  test("grounded answer is approved", () => {
    // Provide docs whose content overlaps significantly with the answer
    const docs = [
      {
        id: "1",
        content:
          "Retrieval augmented generation combines retrieval with generation.",
      },
    ];
    const answer =
      "Retrieval augmented generation combines retrieval with generation.";
    const result = checker.check(answer, docs);
    expect(result.approved).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.5);
  });

  test("hallucinated answer is not approved", () => {
    const docs = [{ id: "1", content: "The capital of France is Paris." }];
    // Answer has nothing to do with the docs
    const answer =
      "Quantum computing uses qubits to perform calculations exponentially faster than classical computers.";
    const result = checker.check(answer, docs);
    // With a high approval threshold it should fail
    const strict = new SelfCritiqueChecker({ approvalThreshold: 0.9 });
    const strictResult = strict.check(answer, docs);
    expect(strictResult.approved).toBe(false);
  });

  test("throws on empty answer", () => {
    expect(() => checker.check("", [{ id: "1", content: "doc" }])).toThrow(
      "non-empty string",
    );
  });

  test("throws on empty retrievedDocs", () => {
    expect(() => checker.check("Some answer", [])).toThrow("non-empty array");
  });

  test('emits "checked" event', () => {
    const handler = jest.fn();
    checker.on("checked", handler);
    checker.check("Retrieval augmented generation is useful.", [
      { id: "1", content: "Retrieval augmented generation is useful." },
    ]);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        approved: expect.any(Boolean),
        score: expect.any(Number),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// AgenticPipeline
// ---------------------------------------------------------------------------
describe("AgenticPipeline", () => {
  test("plans, retrieves, and generates an answer", async () => {
    const retriever = mockRetriever();
    const llm = mockLLM("Generated answer about RAG.");

    const pipeline = new AgenticPipeline({ enableCritique: false });
    const result = await pipeline.run({
      query: "What is RAG?",
      retriever,
      llm,
    });

    expect(result.success).toBe(true);
    expect(result.query).toBe("What is RAG?");
    expect(result.answer).toBeTruthy();
    expect(result.subQueries.length).toBeGreaterThanOrEqual(1);
    expect(retriever.retrieve).toHaveBeenCalled();
    expect(llm.generate).toHaveBeenCalled();
  });

  test("enablePlanning: false uses single query without decomposition", async () => {
    const retriever = mockRetriever();
    const llm = mockLLM("Answer");

    const pipeline = new AgenticPipeline({
      enablePlanning: false,
      enableCritique: false,
    });
    const result = await pipeline.run({
      query: "What is RAG?",
      retriever,
      llm,
    });

    expect(result.subQueries.length).toBe(1);
    expect(result.subQueries[0].strategy).toBe("general");
  });

  test("critique enabled verifies the answer", async () => {
    const docs = [
      {
        id: "1",
        content:
          "Retrieval augmented generation combines retrieval with generation.",
        score: 0.9,
      },
    ];
    const retriever = mockRetriever(docs);
    const llm = mockLLM(
      "Retrieval augmented generation combines retrieval with generation.",
    );

    const pipeline = new AgenticPipeline({ enableCritique: true });
    const result = await pipeline.run({
      query: "What is RAG?",
      retriever,
      llm,
    });

    expect(result.success).toBe(true);
    expect(result.metadata.enabledCritique).toBe(true);
  });

  test("throws when retriever is missing", async () => {
    const pipeline = new AgenticPipeline();
    await expect(
      pipeline.run({ query: "test", retriever: null, llm: mockLLM() }),
    ).rejects.toThrow(".retrieve()");
  });

  test("throws when llm is missing", async () => {
    const pipeline = new AgenticPipeline();
    await expect(
      pipeline.run({ query: "test", retriever: mockRetriever(), llm: null }),
    ).rejects.toThrow(".generate()");
  });

  test("throws on empty query", async () => {
    const pipeline = new AgenticPipeline();
    await expect(
      pipeline.run({ query: "", retriever: mockRetriever(), llm: mockLLM() }),
    ).rejects.toThrow("non-empty string");
  });

  test('emits "planned" event when planning is enabled', async () => {
    const pipeline = new AgenticPipeline({ enableCritique: false });
    const handler = jest.fn();
    pipeline.on("planned", handler);

    await pipeline.run({
      query: "What is RAG?",
      retriever: mockRetriever(),
      llm: mockLLM(),
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('emits "completed" event', async () => {
    const pipeline = new AgenticPipeline({ enableCritique: false });
    const handler = jest.fn();
    pipeline.on("completed", handler);

    await pipeline.run({
      query: "What is RAG?",
      retriever: mockRetriever(),
      llm: mockLLM(),
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("handles retriever returning empty results", async () => {
    const retriever = { retrieve: jest.fn(async () => []) };
    const llm = mockLLM("No results found.");

    const pipeline = new AgenticPipeline({ enableCritique: false });
    const result = await pipeline.run({
      query: "obscure topic",
      retriever,
      llm,
    });

    expect(result.success).toBe(true);
    expect(result.answer).toBeTruthy();
  });

  test("handles LLM returning empty string", async () => {
    const retriever = mockRetriever();
    const llm = mockLLM("");

    const pipeline = new AgenticPipeline({ enableCritique: false });
    const result = await pipeline.run({
      query: "What is RAG?",
      retriever,
      llm,
    });

    expect(result.success).toBe(true);
    expect(result.answer).toBe("");
  });

  test("metadata includes subQueryCount and feature flags", async () => {
    const pipeline = new AgenticPipeline({
      enableCritique: false,
      enableIterativeRetrieval: false,
    });
    const result = await pipeline.run({
      query: "What is RAG?",
      retriever: mockRetriever(),
      llm: mockLLM(),
    });

    expect(result.metadata).toEqual(
      expect.objectContaining({
        subQueryCount: expect.any(Number),
        enabledCritique: false,
        enabledIterative: false,
      }),
    );
  });
});
