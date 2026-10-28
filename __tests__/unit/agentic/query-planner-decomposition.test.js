/**
 * QueryPlanner decomposition: split at clause/question boundaries only, keep
 * noun-phrase conjunctions together, expand comparisons, and optionally use
 * an LLM with strict validation and heuristic fallback.
 */

const { QueryPlanner } = require("../../../src/agentic/query-planner");

const texts = (plan) => plan.subQueries.map((sq) => sq.subQuery);

describe("QueryPlanner heuristic decomposition", () => {
  const planner = new QueryPlanner();

  describe("keeps noun-phrase conjunctions intact", () => {
    test.each([
      "What are salt and pepper used for?",
      "Pros and cons of remote work",
      "How do I install and configure Redis?",
      "Should I use Postgres or MySQL?",
      "Tell me about research and development budgets",
      "What is the role of supply and demand in pricing?",
      "Find documents about black and white photography or film noir",
      "A and B and C and D and E",
      "Research and development budgets, e.g. Google and Apple",
      "What is RAG?",
      "Explain transformers",
    ])("%s", (query) => {
      expect(texts(planner.plan(query))).toEqual([query]);
    });
  });

  describe("splits at clause and question boundaries", () => {
    test.each([
      [
        "What is RAG and how does BM25 work?",
        ["What is RAG", "how does BM25 work?"],
      ],
      [
        "What is machine learning and how does deep learning work and who invented neural networks",
        [
          "What is machine learning",
          "how does deep learning work",
          "who invented neural networks",
        ],
      ],
      [
        "What is the refund policy? How long does shipping take?",
        ["What is the refund policy?", "How long does shipping take?"],
      ],
      [
        "Explain transformers; describe attention mechanisms; what is BERT",
        [
          "Explain transformers",
          "describe attention mechanisms",
          "what is BERT",
        ],
      ],
      [
        "What does the policy say about vacation, and is remote work allowed?",
        ["What does the policy say about vacation", "is remote work allowed?"],
      ],
      [
        "Tell me about bread and butter pudding as well as how to bake it",
        ["Tell me about bread and butter pudding", "how to bake it"],
      ],
      [
        "Who founded salt and pepper diner, and where is it located?",
        ["Who founded salt and pepper diner", "where is it located?"],
      ],
      [
        "Summarize the Q3 report. What changed in revenue?",
        ["Summarize the Q3 report.", "What changed in revenue?"],
      ],
    ])("%s", (query, expected) => {
      expect(texts(planner.plan(query))).toEqual(expected);
    });
  });

  describe("comparisons: one sub-query per entity plus the comparison", () => {
    test.each([
      [
        "Postgres vs MySQL for analytics",
        [
          "Postgres analytics",
          "MySQL analytics",
          "Postgres vs MySQL for analytics",
        ],
      ],
      ["Postgres versus MySQL", ["Postgres", "MySQL", "Postgres versus MySQL"]],
      [
        "Compare transformers and RNNs",
        ["transformers", "RNNs", "Compare transformers and RNNs"],
      ],
      [
        "compare Kafka with RabbitMQ",
        ["Kafka", "RabbitMQ", "compare Kafka with RabbitMQ"],
      ],
      [
        "Compare Python, Java and Go in terms of performance",
        [
          "Python performance",
          "Java performance",
          "Go performance",
          "Compare Python, Java and Go in terms of performance",
        ],
      ],
      [
        "What is the difference between TCP and UDP?",
        ["TCP", "UDP", "What is the difference between TCP and UDP?"],
      ],
      [
        "Which is faster, Redis vs Memcached?",
        ["Redis", "Memcached", "Which is faster, Redis vs Memcached?"],
      ],
    ])("%s", (query, expected) => {
      const plan = planner.plan(query);
      expect(texts(plan)).toEqual(expected);
      const strategies = plan.subQueries.map((sq) => sq.strategy);
      expect(strategies[strategies.length - 1]).toBe("comparative");
      expect(strategies.slice(0, -1).every((s) => s === "factual")).toBe(true);
    });

    test("a comparison clause combined with another instruction", () => {
      const plan = planner.plan(
        "Compare transformers and RNNs and explain the differences",
      );
      expect(texts(plan)).toEqual([
        "transformers",
        "RNNs",
        "Compare transformers and RNNs",
        "explain the differences",
      ]);
    });
  });

  test("priorities follow sub-query order and maxSubQueries is honoured", () => {
    const limited = new QueryPlanner({ maxSubQueries: 2 });
    const plan = limited.plan("What is A? What is B? What is C? What is D?");
    expect(texts(plan)).toEqual(["What is A?", "What is B?"]);
    expect(plan.subQueries.map((sq) => sq.priority)).toEqual([0, 1]);
    expect(plan.source).toBe("heuristic");
  });

  test("words containing 'vs' are not comparisons", () => {
    expect(planner.plan("Canvas rendering").subQueries[0].strategy).toBe(
      "general",
    );
  });
});

describe("QueryPlanner with an llm", () => {
  const QUERY = "What is RAG and how does BM25 work?";
  const llmReturning = (value) => ({ generate: jest.fn(async () => value) });

  test("uses a valid JSON array from the llm", async () => {
    const planner = new QueryPlanner();
    const llm = llmReturning('["What is RAG?", "How does BM25 work?"]');
    const signal = new AbortController().signal;

    const plan = await planner.plan(QUERY, { llm, signal });

    expect(texts(plan)).toEqual(["What is RAG?", "How does BM25 work?"]);
    expect(plan.source).toBe("llm");
    expect(plan.subQueries[1].strategy).toBe("analytical");
    expect(llm.generate).toHaveBeenCalledWith(
      expect.stringContaining(QUERY),
      [],
      { signal },
    );
  });

  test("accepts a fenced JSON array", async () => {
    const planner = new QueryPlanner();
    const plan = await planner.plan(QUERY, {
      llm: llmReturning('```json\n["What is RAG?"]\n```'),
    });
    expect(texts(plan)).toEqual(["What is RAG?"]);
  });

  test.each([
    ["prose", "Sure! Here are the sub-queries: What is RAG?"],
    ["an object", '{"queries": ["What is RAG?"]}'],
    ["an empty array", "[]"],
    ["non-string items", '["What is RAG?", 42]'],
    ["blank items", '["What is RAG?", "  "]'],
    ["multi-line items", '["What is\\nRAG?"]'],
    ["too many items", JSON.stringify(["a", "b", "c", "d", "e", "f"])],
    ["an over-long item", JSON.stringify(["x".repeat(501)])],
    ["invalid JSON", '["What is RAG?",]'],
    ["a non-string value", 123],
  ])("falls back to the heuristic on %s", async (_label, raw) => {
    const planner = new QueryPlanner();
    const plan = await planner.plan(QUERY, { llm: llmReturning(raw) });
    expect(plan.source).toBe("heuristic");
    expect(texts(plan)).toEqual(["What is RAG", "how does BM25 work?"]);
  });

  test("falls back when the llm throws", async () => {
    const planner = new QueryPlanner();
    const llm = {
      generate: async () => {
        throw new Error("rate limited");
      },
    };
    const plan = await planner.plan(QUERY, { llm });
    expect(plan.source).toBe("heuristic");
  });

  test("rethrows when the run was aborted", async () => {
    const planner = new QueryPlanner();
    const controller = new AbortController();
    const llm = {
      generate: async () => {
        controller.abort();
        throw new Error("aborted");
      },
    };
    await expect(
      planner.plan(QUERY, { llm, signal: controller.signal }),
    ).rejects.toThrow("aborted");
  });

  test("emits 'planned' once for an llm plan", async () => {
    const planner = new QueryPlanner();
    const handler = jest.fn();
    planner.on("planned", handler);
    await planner.plan(QUERY, { llm: llmReturning('["What is RAG?"]') });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
