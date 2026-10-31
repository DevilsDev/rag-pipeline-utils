/**
 * createRagPipeline: cancellation (timeout and caller AbortSignal), the
 * retrieval-only mode without an llm, and citations/evaluation in stream mode.
 */

const { createRagPipeline } = require("../../../src/core/create-pipeline");

const DOCS = [
  {
    id: "vacation",
    content: "Employees receive twenty days of paid vacation per year.",
  },
  { id: "remote", content: "Remote work is allowed two days per week." },
];
const ANSWER = "Employees receive twenty days of paid vacation per year.";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Components that record the options they were called with. */
function recordingComponents({ retrieveDelay = 0, honourSignal = false } = {}) {
  const calls = { embed: [], retrieve: [], rerank: [], generate: [] };
  const embedder = {
    embedQuery: async (text, options) => {
      calls.embed.push({ text, options });
      return [1, 0, 0];
    },
  };
  const retriever = {
    retrieve: (request) => {
      calls.retrieve.push(request);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => resolve(DOCS), retrieveDelay);
        if (honourSignal && request.signal) {
          request.signal.addEventListener("abort", () => {
            clearTimeout(t);
            reject(request.signal.reason);
          });
        }
      });
    },
  };
  const reranker = {
    rerank: async (query, docs, options) => {
      calls.rerank.push({ query, docs, options });
      return docs;
    },
  };
  const llm = {
    generate: async (query, docs, options) => {
      calls.generate.push({ query, docs, options });
      return ANSWER;
    },
  };
  return { calls, embedder, retriever, reranker, llm };
}

describe("createRagPipeline cancellation", () => {
  beforeEach(() => jest.useRealTimers());

  test("passes one AbortSignal to every component call", async () => {
    const c = recordingComponents();
    const pipeline = createRagPipeline(c);

    const result = await pipeline.run({ query: "vacation" });

    expect(result.success).toBe(true);
    const signal = c.calls.retrieve[0].signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
    expect(c.calls.embed[0].options.signal).toBe(signal);
    expect(c.calls.rerank[0].options.signal).toBe(signal);
    expect(c.calls.generate[0].options.signal).toBe(signal);
  });

  test("a timeout aborts the signal and no later stage runs", async () => {
    // The retriever ignores the signal and resolves after the timeout.
    const c = recordingComponents({ retrieveDelay: 400 });
    const pipeline = createRagPipeline(c);

    const started = Date.now();
    const result = await pipeline.run({
      query: "vacation",
      options: { timeout: 20 },
    });

    expect(result).toEqual({ success: false, error: "Execution timeout" });
    expect(Date.now() - started).toBeLessThan(300);
    expect(c.calls.retrieve[0].signal.aborted).toBe(true);

    // Let the ignored retrieval finish: the pipeline must not continue.
    await sleep(450);
    expect(c.calls.rerank).toHaveLength(0);
    expect(c.calls.generate).toHaveLength(0);
  });

  test("a component that honours the signal is cancelled on timeout", async () => {
    const c = recordingComponents({ retrieveDelay: 5000, honourSignal: true });
    const pipeline = createRagPipeline(c);

    const result = await pipeline.run({
      query: "vacation",
      options: { timeout: 20 },
    });

    expect(result).toEqual({ success: false, error: "Execution timeout" });
    expect(c.calls.generate).toHaveLength(0);
  });

  test("the caller's options.signal cancels the run", async () => {
    const c = recordingComponents({ retrieveDelay: 400 });
    const pipeline = createRagPipeline(c);
    const controller = new AbortController();

    const pending = pipeline.run({
      query: "vacation",
      options: { signal: controller.signal },
    });
    await sleep(10);
    controller.abort();
    const result = await pending;

    expect(result).toEqual({ success: false, error: "Execution aborted" });
    expect(c.calls.retrieve[0].signal.aborted).toBe(true);
    // The components get the run's own signal, which follows the caller's.
    expect(c.calls.retrieve[0].signal).not.toBe(controller.signal);
    await sleep(450);
    expect(c.calls.generate).toHaveLength(0);
  });

  test("an already-aborted signal calls no component", async () => {
    const c = recordingComponents();
    const pipeline = createRagPipeline(c);
    const controller = new AbortController();
    controller.abort();

    const result = await pipeline.run({
      query: "vacation",
      options: { signal: controller.signal },
    });

    expect(result).toEqual({ success: false, error: "Execution aborted" });
    expect(c.calls.embed).toHaveLength(0);
    expect(c.calls.retrieve).toHaveLength(0);
  });

  test("components that ignore extra arguments still work", async () => {
    const pipeline = createRagPipeline({
      embedder: { embed: async (text) => [text.length, 1, 0] },
      retriever: { retrieve: async ({ query }) => [{ id: query }] },
      llm: { generate: async () => "fine" },
    });

    const result = await pipeline.run({ query: "q" });

    expect(result).toMatchObject({ success: true, answer: "fine" });
  });

  test("no artificial delay: a run completes without advancing timers", async () => {
    jest.useFakeTimers();
    const c = recordingComponents();
    c.retriever = { retrieve: async () => DOCS };
    const pipeline = createRagPipeline(c);

    const result = await pipeline.run({ query: "vacation" });

    expect(result.success).toBe(true);
    jest.useRealTimers();
  });
});

describe("createRagPipeline without an llm", () => {
  beforeEach(() => jest.useRealTimers());

  const retriever = { retrieve: async () => DOCS };

  test("runs retrieval only and returns answer: null", async () => {
    const pipeline = createRagPipeline({ retriever });

    const result = await pipeline.run({ query: "vacation" });

    expect(result).toEqual({
      success: true,
      query: "vacation",
      results: DOCS,
      answer: null,
      timing: { totalMs: expect.any(Number) },
    });
  });

  test("skips citations and evaluates retrieval metrics only", async () => {
    const pipeline = createRagPipeline({ retriever });

    const result = await pipeline.run({
      query: "How many vacation days do employees receive?",
      options: { citations: true, evaluate: true, referenceAnswer: ANSWER },
    });

    expect(result.answer).toBeNull();
    expect(result).not.toHaveProperty("citations");
    expect(Object.keys(result.evaluation.scores).sort()).toEqual([
      "contextPrecision",
      "contextRecall",
    ]);
    expect(result.evaluation.scores.contextRecall).toBe(1);
  });

  test("an llm run always returns the answer", async () => {
    const pipeline = createRagPipeline({
      retriever,
      llm: { generate: async () => ANSWER },
    });

    const result = await pipeline.run({ query: "vacation" });

    expect(result.answer).toBe(ANSWER);
  });

  test("evaluate passes options.referenceAnswer through for context recall", async () => {
    const pipeline = createRagPipeline({
      retriever,
      llm: { generate: async () => ANSWER },
    });

    const withRef = await pipeline.run({
      query: "vacation",
      options: { evaluate: true, referenceAnswer: ANSWER },
    });
    const withoutRef = await pipeline.run({
      query: "vacation",
      options: { evaluate: true },
    });

    expect(withRef.evaluation.scores.contextRecall).toBe(1);
    expect(withoutRef.evaluation.scores).not.toHaveProperty("contextRecall");
  });
});

describe("createRagPipeline stream mode", () => {
  beforeEach(() => jest.useRealTimers());

  const retriever = { retrieve: async () => DOCS };

  async function collect(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return chunks;
  }

  test("ends with citations and evaluation when requested (generateStream)", async () => {
    async function* tokens() {
      yield { token: "Employees receive ", done: false };
      yield { token: "twenty days of paid vacation per year.", done: false };
      yield { token: "", done: true };
    }
    const pipeline = createRagPipeline({
      retriever,
      llm: { generateStream: () => tokens() },
    });

    const chunks = await collect(
      await pipeline.run({
        query: "How much vacation?",
        options: { stream: true, citations: true, evaluate: true },
      }),
    );

    expect(chunks.slice(0, 2)).toEqual([
      { token: "Employees receive ", done: false },
      { token: "twenty days of paid vacation per year.", done: false },
    ]);
    expect(chunks).toHaveLength(3);
    const final = chunks[2];
    expect(final).toMatchObject({ token: "", done: true });
    expect(final.citations.groundednessScore).toBe(1);
    expect(final.citations.citations[0].sources[0].docId).toBe("vacation");
    expect(final.evaluation.scores.faithfulness).toBe(1);
    expect(chunks.filter((c) => c.done)).toHaveLength(1);
  });

  test("keeps a token carried by the source's done chunk", async () => {
    async function* tokens() {
      yield { token: "Employees receive ", done: false };
      yield { token: "twenty days of paid vacation per year.", done: true };
    }
    const pipeline = createRagPipeline({
      retriever,
      llm: { generateStream: () => tokens() },
    });

    const chunks = await collect(
      await pipeline.run({
        query: "q",
        options: { stream: true, citations: true },
      }),
    );

    expect(chunks.map((c) => c.token).join("")).toBe(ANSWER);
    expect(chunks[chunks.length - 1]).toMatchObject({ token: "", done: true });
    expect(chunks[chunks.length - 1].citations.groundednessScore).toBe(1);
  });

  test("generate() fallback also gets the final chunk", async () => {
    const pipeline = createRagPipeline({
      retriever,
      llm: { generate: async () => ANSWER },
    });

    const chunks = await collect(
      await pipeline.run({
        query: "q",
        options: { stream: true, citations: true },
      }),
    );

    expect(chunks[0]).toEqual({ token: ANSWER, done: false });
    expect(chunks[1]).toMatchObject({ token: "", done: true });
    expect(chunks[1].citations.groundednessScore).toBe(1);
    expect(chunks[1]).not.toHaveProperty("evaluation");
  });

  test("passes the run signal to generateStream and stops on caller abort", async () => {
    let received;
    async function* tokens() {
      for (let i = 0; i < 100; i++) {
        await sleep(5);
        yield { token: `t${i} `, done: false };
      }
      yield { token: "", done: true };
    }
    const pipeline = createRagPipeline({
      retriever,
      llm: {
        generateStream: (q, docs, options) => {
          received = options.signal;
          return tokens();
        },
      },
    });
    const controller = new AbortController();

    const stream = await pipeline.run({
      query: "q",
      options: { stream: true, signal: controller.signal },
    });
    const seen = [];
    await expect(
      (async () => {
        for await (const chunk of stream) {
          seen.push(chunk);
          if (seen.length === 2) controller.abort();
        }
      })(),
    ).rejects.toThrow("Execution aborted");

    expect(received).toBeInstanceOf(AbortSignal);
    expect(received.aborted).toBe(true);
    expect(seen.length).toBeLessThan(5);
  });

  test("without an llm the stream is a single done chunk with the results", async () => {
    const pipeline = createRagPipeline({ retriever });

    const chunks = await collect(
      await pipeline.run({ query: "q", options: { stream: true } }),
    );

    expect(chunks).toEqual([
      {
        token: "",
        done: true,
        results: DOCS,
        timing: { firstTokenMs: null, totalMs: expect.any(Number) },
      },
    ]);
  });
});

describe("createRagPipeline timing", () => {
  beforeEach(() => jest.useRealTimers());

  const retriever = { retrieve: async () => DOCS };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function collect(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return chunks;
  }
  // Waits before its first token, then streams the rest at once.
  const slowStartLlm = {
    async *generateStream() {
      await sleep(60);
      yield { token: "Twenty ", done: false };
      yield { token: "days.", done: false };
      await sleep(40);
      yield { token: "", done: true };
    },
  };

  test("a streamed answer's done chunk carries time to first token and total", async () => {
    const pipeline = createRagPipeline({ retriever, llm: slowStartLlm });

    const chunks = await collect(
      await pipeline.run({ query: "q", options: { stream: true } }),
    );

    const done = chunks[chunks.length - 1];
    expect(done.done).toBe(true);
    expect(chunks.slice(0, -1).every((c) => c.timing === undefined)).toBe(true);
    const { firstTokenMs, totalMs } = done.timing;
    expect(firstTokenMs).toBeGreaterThanOrEqual(55);
    expect(totalMs).toBeGreaterThanOrEqual(firstTokenMs + 35);
  });

  test("with citations the final chunk carries the timing too", async () => {
    const pipeline = createRagPipeline({ retriever, llm: slowStartLlm });

    const chunks = await collect(
      await pipeline.run({
        query: "q",
        options: { stream: true, citations: true },
      }),
    );

    const done = chunks[chunks.length - 1];
    expect(done.citations).toBeDefined();
    expect(done.timing.firstTokenMs).toBeGreaterThanOrEqual(55);
    expect(done.timing.totalMs).toBeGreaterThanOrEqual(
      done.timing.firstTokenMs,
    );
  });

  test("time to first token counts retrieval, and skips empty tokens", async () => {
    const pipeline = createRagPipeline({
      retriever: {
        retrieve: async () => {
          await sleep(50);
          return DOCS;
        },
      },
      llm: {
        async *generateStream() {
          yield { token: "", done: false };
          await sleep(30);
          yield { token: "Hi", done: false };
          yield { token: "", done: true };
        },
      },
    });

    const chunks = await collect(
      await pipeline.run({ query: "q", options: { stream: true } }),
    );

    expect(chunks.at(-1).timing.firstTokenMs).toBeGreaterThanOrEqual(75);
  });

  test("a result carries the run's total time", async () => {
    const pipeline = createRagPipeline({
      retriever,
      llm: {
        generate: async () => {
          await sleep(30);
          return "Twenty days.";
        },
      },
    });

    const result = await pipeline.run({ query: "q" });

    expect(result.timing.totalMs).toBeGreaterThanOrEqual(25);
    expect(result.timing).not.toHaveProperty("firstTokenMs");
  });
});

describe("createRagPipeline with an empty answer", () => {
  beforeEach(() => jest.useRealTimers());

  const retriever = { retrieve: async () => DOCS };
  const emptyLlm = {
    generate: async () => "",
    async *generateStream() {
      yield { token: "", done: true };
    },
  };

  test("citations are skipped instead of failing the run", async () => {
    const pipeline = createRagPipeline({ retriever, llm: emptyLlm });

    const result = await pipeline.run({
      query: "q",
      options: { citations: true, evaluate: true },
    });

    expect(result.success).toBe(true);
    expect(result.answer).toBe("");
    expect(result.citations).toBeUndefined();
    expect(result.evaluation).toBeDefined();
  });

  test("a stream ends normally", async () => {
    const pipeline = createRagPipeline({ retriever, llm: emptyLlm });
    const chunks = [];
    for await (const chunk of await pipeline.run({
      query: "q",
      options: { stream: true, citations: true },
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0].done).toBe(true);
    expect(chunks[0].citations).toBeUndefined();
  });
});
