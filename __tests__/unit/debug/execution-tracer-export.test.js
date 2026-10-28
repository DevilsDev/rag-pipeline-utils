"use strict";

const { ExecutionTracer } = require("../../../src/debug/execution-tracer");

function fakePipeline() {
  return {
    run: async ({ query }) => ({
      success: true,
      query,
      results: [{ id: "a", content: "Twenty days of vacation." }],
      answer: "Twenty days.",
    }),
  };
}

describe("ExecutionTracer export", () => {
  test("exportTraces('json') works with the default captureOutputs", async () => {
    const tracer = new ExecutionTracer();
    const traced = tracer.trace(fakePipeline());
    const result = await traced.run({ query: "vacation?" });

    // The result carries its trace, which used to make the trace circular.
    expect(result.trace).toBeDefined();
    const exported = JSON.parse(tracer.exportTraces("json"));
    expect(exported).toHaveLength(1);
    expect(exported[0].output.answer).toBe("Twenty days.");
    expect(exported[0].output).not.toHaveProperty("trace");
    expect(exported[0].steps[0].output.answer).toBe("Twenty days.");
  });

  test("recorded traces do not change when the result is mutated", async () => {
    const tracer = new ExecutionTracer();
    const result = await tracer.trace(fakePipeline()).run({ query: "q" });
    result.answer = "changed later";
    expect(tracer.getTraces()[0].output.answer).toBe("Twenty days.");
  });

  test("large payloads are still truncated", async () => {
    const tracer = new ExecutionTracer({ maxPayloadSize: 20 });
    await tracer.trace(fakePipeline()).run({ query: "q" });
    const [trace] = tracer.getTraces();
    expect(typeof trace.output).toBe("string");
    expect(trace.output).toMatch(/\.\.\.\[truncated\]$/);
    expect(() => tracer.exportTraces("json")).not.toThrow();
  });
});
