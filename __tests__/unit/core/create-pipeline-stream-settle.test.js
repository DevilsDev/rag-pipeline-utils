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
