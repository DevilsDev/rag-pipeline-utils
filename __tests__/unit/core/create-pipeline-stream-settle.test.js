/**
 * Streams of createRagPipeline: they settle on abort even when the source
 * ignores the signal, and normalise what the source yields.
 */
const { createRagPipeline } = require("../../../src/core/create-pipeline");

const docs = [
  { id: "1", content: "Employees get 20 vacation days.", score: 1 },
];
const retriever = {
  async retrieve() {
    return docs;
  },
};

async function collect(iterable) {
  const out = [];
  for await (const chunk of iterable) out.push(chunk);
  return out;
}

const pendingForever = () => new Promise(() => {});
const within = (ms, promise) =>
  Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve("PENDING"), ms)),
  ]);

describe("a stream settles on abort", () => {
  test("when the source ignores the signal", async () => {
    const llm = {
      async *generateStream() {
        yield { token: "a", done: false };
        await pendingForever();
      },
    };
    const pipeline = createRagPipeline({ retriever, llm });
    const controller = new AbortController();
    const stream = await pipeline.run({
      query: "q",
      options: { stream: true, signal: controller.signal },
    });
    const it = stream[Symbol.asyncIterator]();
    expect((await it.next()).value.token).toBe("a");
    setTimeout(() => controller.abort(), 20);
    const outcome = await within(
      1000,
      it.next().then(
        () => "RESOLVED",
        (e) => e.message,
      ),
    );
    expect(outcome).toBe("Execution aborted");
  });

  test("when the source never yields", async () => {
    const llm = {
      async *generateStream() {
        await pendingForever();
      },
    };
    const pipeline = createRagPipeline({ retriever, llm });
    const controller = new AbortController();
    const stream = await pipeline.run({
      query: "q",
      options: { stream: true, signal: controller.signal },
    });
    setTimeout(() => controller.abort(), 20);
    const outcome = await within(
      1000,
      collect(stream).then(
        () => "RESOLVED",
        (e) => e.message,
      ),
    );
    expect(outcome).toBe("Execution aborted");
  });
});

describe("stream chunks are normalised", () => {
  const stringLlm = {
    async generate() {
      return "Employees get 20 vacation days.";
    },
    async *generateStream() {
      yield "Employees get ";
      yield "20 vacation days.";
    },
  };

  test("string chunks become { token, done } chunks and a done chunk follows", async () => {
    const pipeline = createRagPipeline({ retriever, llm: stringLlm });
    const chunks = await collect(
      await pipeline.run({ query: "q", options: { stream: true } }),
    );
    expect(chunks.map((c) => [c.token, c.done])).toEqual([
      ["Employees get ", false],
      ["20 vacation days.", false],
      ["", true],
    ]);
    expect(chunks.at(-1).timing.firstTokenMs).not.toBeNull();
  });

  test("a source that never sends a done chunk still ends with one", async () => {
    const llm = {
      async *generateStream() {
        yield { token: "a", done: false };
        yield { token: "b", done: false };
      },
    };
    const pipeline = createRagPipeline({ retriever, llm });
    const chunks = await collect(
      await pipeline.run({ query: "q", options: { stream: true } }),
    );
    expect(chunks.map((c) => c.done)).toEqual([false, false, true]);
    expect(chunks.at(-1).timing.totalMs).toBeGreaterThanOrEqual(0);
  });

  test("a source's own done chunk is not doubled", async () => {
    const llm = {
      async *generateStream() {
        yield { token: "a", done: false };
        yield { token: "", done: true };
      },
    };
    const pipeline = createRagPipeline({ retriever, llm });
    const chunks = await collect(
      await pipeline.run({ query: "q", options: { stream: true } }),
    );
    expect(chunks.filter((c) => c.done)).toHaveLength(1);
  });

  test("with citations the string chunks are normalised too", async () => {
    const pipeline = createRagPipeline({ retriever, llm: stringLlm });
    const chunks = await collect(
      await pipeline.run({
        query: "q",
        options: { stream: true, citations: true },
      }),
    );
    expect(chunks.slice(0, -1).every((c) => typeof c === "object")).toBe(true);
    expect(chunks.at(-1).done).toBe(true);
    expect(chunks.at(-1).citations).toBeDefined();
  });
});

describe("timeout covers the stream", () => {
  const slowLlm = {
    async *generateStream() {
      yield { token: "a", done: false };
      await new Promise((resolve) => setTimeout(resolve, 600));
      yield { token: "b", done: false };
      yield { token: "", done: true };
    },
  };

  test("a stream still running at the timeout is aborted", async () => {
    const pipeline = createRagPipeline({ retriever, llm: slowLlm });
    const started = performance.now();
    const stream = await pipeline.run({
      query: "q",
      options: { stream: true, timeout: 150 },
    });
    const seen = [];
    let error;
    try {
      for await (const chunk of stream) seen.push(chunk.token);
    } catch (e) {
      error = e;
    }
    expect(seen).toEqual(["a"]);
    expect(error.message).toBe("Execution timeout");
    expect(performance.now() - started).toBeLessThan(450);
  });

  test("a stream that finishes in time is untouched", async () => {
    const llm = {
      async *generateStream() {
        yield { token: "a", done: false };
        yield { token: "", done: true };
      },
    };
    const pipeline = createRagPipeline({ retriever, llm });
    const chunks = await collect(
      await pipeline.run({
        query: "q",
        options: { stream: true, timeout: 5000 },
      }),
    );
    expect(chunks.map((c) => c.token)).toEqual(["a", ""]);
  });
});

describe("a stream's done chunk matches run()", () => {
  const llm = {
    cacheKey: "l1",
    config: { temperature: 0 },
    async generate() {
      return "Employees get 20 vacation days.";
    },
  };
  const retrieverWithKey = { cacheKey: "r1", ...retriever };

  test("it carries the results and the cache outcome", async () => {
    const pipeline = createRagPipeline({
      retriever: retrieverWithKey,
      llm,
      cache: true,
    });
    const result = await pipeline.run({ query: "q" });
    const chunks = await collect(
      await pipeline.run({ query: "q", options: { stream: true } }),
    );
    const done = chunks.at(-1);
    expect(done.done).toBe(true);
    expect(done.results).toEqual(result.results);
    expect(Object.keys(done.cache).sort()).toEqual(
      Object.keys(result.cache).sort(),
    );
  });

  test("without a cache it has no cache field, like run()", async () => {
    const pipeline = createRagPipeline({ retriever, llm });
    const result = await pipeline.run({ query: "q" });
    const done = (
      await collect(
        await pipeline.run({ query: "q", options: { stream: true } }),
      )
    ).at(-1);
    expect("cache" in result).toBe(false);
    expect("cache" in done).toBe(false);
    expect(done.results).toEqual(result.results);
  });

  test("an answer of 0 streams the same text as run() returns", async () => {
    const zero = {
      async generate() {
        return 0;
      },
    };
    const pipeline = createRagPipeline({ retriever, llm: zero });
    const result = await pipeline.run({ query: "q" });
    const chunks = await collect(
      await pipeline.run({ query: "q", options: { stream: true } }),
    );
    expect(chunks.map((c) => c.token).join("")).toBe(result.answer);
  });
});
