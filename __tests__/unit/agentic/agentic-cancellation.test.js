/**
 * Cancellation in AgenticPipeline and IterativeRetriever: the run's
 * AbortSignal reaches every component call, and an abort (timeout or the
 * caller's options.signal) stops later stages.
 */

const { AgenticPipeline } = require("../../../src/agentic/agentic-pipeline");
const {
  IterativeRetriever,
} = require("../../../src/agentic/iterative-retriever");

const DOCS = [
  { id: "a", content: "Retrieval augmented generation combines search." },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function recorder({ retrieveDelay = 0 } = {}) {
  const calls = { retrieve: [], generate: [], embed: [] };
  return {
    calls,
    retriever: {
      retrieve: (request) => {
        calls.retrieve.push(request);
        return new Promise((r) => setTimeout(() => r(DOCS), retrieveDelay));
      },
    },
    llm: {
      generate: async (query, docs, options) => {
        calls.generate.push({ query, options });
        return "Retrieval augmented generation combines search.";
      },
    },
    embedder: {
      embedQuery: async (text, options) => {
        calls.embed.push({ text, options });
        return [1, 0];
      },
    },
  };
}

describe("AgenticPipeline cancellation", () => {
  beforeEach(() => jest.useRealTimers());

  test("passes the run signal to retriever, embedder and llm", async () => {
    const c = recorder();
    const pipeline = new AgenticPipeline({ enablePlanning: false });

    const result = await pipeline.run({
      query: "What is RAG?",
      retriever: c.retriever,
      llm: c.llm,
      embedder: c.embedder,
      options: { temperature: 0 },
    });

    expect(result.success).toBe(true);
    const signal = c.calls.retrieve[0].signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(c.calls.embed[0].options.signal).toBe(signal);
    expect(c.calls.generate[0].options).toMatchObject({
      temperature: 0,
      signal,
    });
  });

  test("a timeout rejects, aborts the signal and skips generation", async () => {
    const c = recorder({ retrieveDelay: 400 });
    const pipeline = new AgenticPipeline({
      enablePlanning: false,
      timeout: 20,
    });

    await expect(
      pipeline.run({
        query: "What is RAG?",
        retriever: c.retriever,
        llm: c.llm,
      }),
    ).rejects.toThrow("Execution timeout");

    expect(c.calls.retrieve[0].signal.aborted).toBe(true);
    await sleep(450);
    expect(c.calls.generate).toHaveLength(0);
  });

  test("the caller's options.signal cancels the run", async () => {
    const c = recorder({ retrieveDelay: 400 });
    const pipeline = new AgenticPipeline({ enablePlanning: false });
    const controller = new AbortController();

    const pending = pipeline.run({
      query: "What is RAG?",
      retriever: c.retriever,
      llm: c.llm,
      options: { signal: controller.signal },
    });
    await sleep(10);
    controller.abort();

    await expect(pending).rejects.toThrow("Execution aborted");
    await sleep(450);
    expect(c.calls.generate).toHaveLength(0);
  });

  test("enableLlmPlanning asks the llm for sub-queries with the run signal", async () => {
    const c = recorder();
    const generate = c.llm.generate;
    c.llm.generate = async (query, docs, options) =>
      query.startsWith("Split the user question")
        ? (c.calls.generate.push({ query, options }),
          '["What is RAG?", "What is BM25?"]')
        : generate(query, docs, options);
    const pipeline = new AgenticPipeline({
      enableLlmPlanning: true,
      enableCritique: false,
    });

    const result = await pipeline.run({
      query: "Tell me about RAG",
      retriever: c.retriever,
      llm: c.llm,
    });

    expect(result.subQueries.map((sq) => sq.subQuery)).toEqual([
      "What is RAG?",
      "What is BM25?",
    ]);
    expect(c.calls.generate[0].options.signal).toBeInstanceOf(AbortSignal);
    expect(c.calls.retrieve.map((r) => r.query)).toEqual([
      "What is RAG?",
      "What is BM25?",
    ]);
  });

  test("LLM planning is off by default (one generate call per run)", async () => {
    const c = recorder();
    const pipeline = new AgenticPipeline({ enableCritique: false });

    await pipeline.run({
      query: "What is RAG and how does BM25 work?",
      retriever: c.retriever,
      llm: c.llm,
    });

    expect(c.calls.generate).toHaveLength(1);
  });

  test("passes the signal through iterative retrieval", async () => {
    const c = recorder();
    const pipeline = new AgenticPipeline({
      enablePlanning: false,
      enableCritique: false,
      enableIterativeRetrieval: true,
      iterativeOptions: { maxIterations: 1 },
    });

    await pipeline.run({
      query: "What is RAG?",
      retriever: c.retriever,
      llm: c.llm,
    });

    expect(c.calls.retrieve[0].signal).toBeInstanceOf(AbortSignal);
  });
});

describe("IterativeRetriever cancellation", () => {
  beforeEach(() => jest.useRealTimers());

  test("forwards the signal and stops iterating once aborted", async () => {
    const controller = new AbortController();
    const calls = [];
    const retriever = {
      retrieve: async (request) => {
        calls.push(request);
        controller.abort();
        return [{ id: "x", content: "unrelated" }];
      },
    };
    const ir = new IterativeRetriever({ maxIterations: 3 });

    await expect(
      ir.retrieve({
        query: "what is retrieval augmented generation",
        retriever,
        signal: controller.signal,
      }),
    ).rejects.toThrow();

    expect(calls).toHaveLength(1);
    expect(calls[0].signal).toBe(controller.signal);
  });

  test("does not retry a retrieval after an abort", async () => {
    const controller = new AbortController();
    let attempts = 0;
    const retriever = {
      retrieve: async () => {
        attempts += 1;
        controller.abort();
        throw new Error("network");
      },
    };
    const ir = new IterativeRetriever({
      retryOptions: { retries: 3, baseDelay: 0 },
    });

    await expect(
      ir.retrieve({ query: "q", retriever, signal: controller.signal }),
    ).rejects.toThrow();
    expect(attempts).toBe(1);
  });

  test("an aborted llm refinement is not swallowed by the heuristic fallback", async () => {
    const controller = new AbortController();
    const retriever = {
      retrieve: jest.fn(async () => [{ id: "x", content: "unrelated" }]),
    };
    const llm = {
      generate: async (_prompt, _docs, options) => {
        expect(options.signal).toBe(controller.signal);
        controller.abort();
        throw new Error("aborted by provider");
      },
    };
    const ir = new IterativeRetriever({ maxIterations: 3 });

    await expect(
      ir.retrieve({
        query: "what is retrieval augmented generation",
        retriever,
        llm,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(retriever.retrieve).toHaveBeenCalledTimes(1);
  });

  test("without a signal the request shape is unchanged", async () => {
    const retriever = { retrieve: jest.fn(async () => DOCS) };
    const ir = new IterativeRetriever({ maxIterations: 1 });

    await ir.retrieve({ query: "rag", retriever });

    expect(retriever.retrieve.mock.calls[0][0]).toEqual({
      query: "rag",
      queryVector: undefined,
      topK: 10,
    });
    expect(retriever.retrieve.mock.calls[0][0]).not.toHaveProperty("signal");
  });
});
