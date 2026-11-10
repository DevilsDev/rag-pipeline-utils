"use strict";

const { AgenticPipeline } = require("../../../src/agentic/agentic-pipeline");
const {
  IterativeRetriever,
} = require("../../../src/agentic/iterative-retriever");

const DOC = {
  id: "a",
  content: "Employees get twenty vacation days off each year per the policy.",
};

describe("IterativeRetriever coverage", () => {
  test("is the share of query words found in the results, so it converges when they all are", async () => {
    let calls = 0;
    const retriever = {
      retrieve: async () => {
        calls += 1;
        return [DOC];
      },
    };
    const out = await new IterativeRetriever().retrieve({
      query: "vacation days",
      retriever,
    });
    expect(out.coverage).toBe(1);
    expect(out.converged).toBe(true);
    expect(out.iterations).toBe(1);
    expect(calls).toBe(1);
  });

  test("is partial when only some query words are found", async () => {
    const retriever = { retrieve: async () => [DOC] };
    const it = new IterativeRetriever({ maxIterations: 1 });
    const out = await it.retrieve({
      query: "vacation days sabbatical",
      retriever,
    });
    expect(out.coverage).toBeCloseTo(2 / 3, 2);
    expect(out.converged).toBe(true);
  });

  test("does not converge when the results hold none of the query words", async () => {
    const retriever = {
      retrieve: async () => [{ id: "z", content: "Parking is free." }],
    };
    const it = new IterativeRetriever({
      maxIterations: 2,
      retryOptions: { retries: 0 },
    });
    const out = await it.retrieve({ query: "vacation days", retriever });
    expect(out.converged).toBe(false);
    expect(out.iterations).toBe(2);
  });
});

describe("AgenticPipeline maxIterations", () => {
  test("is passed to the iterative retriever", async () => {
    let calls = 0;
    const retriever = {
      retrieve: async () => {
        calls += 1;
        return [{ id: "z", content: "Parking is free." }];
      },
    };
    const ap = new AgenticPipeline({
      enableIterativeRetrieval: true,
      maxIterations: 1,
      enablePlanning: false,
      enableCritique: false,
    });
    await ap.run({
      query: "vacation days",
      retriever,
      llm: { generate: async () => "vacation days" },
    });
    expect(calls).toBe(1);
  });

  test("iterativeOptions.maxIterations still wins", async () => {
    const ap = new AgenticPipeline({
      enableIterativeRetrieval: true,
      maxIterations: 1,
      iterativeOptions: { maxIterations: 4 },
    });
    expect(ap.iterativeRetriever.config.maxIterations).toBe(4);
  });
});
