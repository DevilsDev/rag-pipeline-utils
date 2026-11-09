/**
 * The run's signal reaches llm.route() and filterResults(), so a timeout
 * or a caller's abort is visible to them, not just to the retriever/llm.
 */
const { createRagPipeline } = require("../../../src/core/create-pipeline");

const retriever = {
  async retrieve() {
    return [{ id: "1", content: "x", score: 1 }];
  },
};

test("llm.route receives the run's signal, which a timeout aborts", async () => {
  let routeSignal;
  const llm = {
    async route(_q, _docs, opts) {
      routeSignal = opts.signal;
      await new Promise((resolve) => setTimeout(resolve, 200));
      return { class: "s", model: "m", estimatedCost: 0 };
    },
    async generate() {
      return "x";
    },
  };
  const pipeline = createRagPipeline({ retriever, llm });
  const result = await pipeline.run({ query: "q", options: { timeout: 50 } });
  expect(result.success).toBe(false);
  expect(routeSignal).toBeInstanceOf(AbortSignal);
  expect(routeSignal.aborted).toBe(true);
});

test("filterResults receives the run's signal as a second argument", async () => {
  let seen;
  const pipeline = createRagPipeline({ retriever });
  await pipeline.run({
    query: "q",
    options: {
      timeout: 1000,
      filterResults: (docs, extra) => {
        seen = extra;
        return docs;
      },
    },
  });
  expect(seen.signal).toBeInstanceOf(AbortSignal);
});
