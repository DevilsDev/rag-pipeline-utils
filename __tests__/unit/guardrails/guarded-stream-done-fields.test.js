/**
 * A guarded stream's done chunk is built from an allowlist: done, success,
 * error, timing, the redacted citations and evaluation, type-checked cache,
 * route and packing fields, and the guard summary. Anything else the wrapped pipeline puts in its done chunk
 * (results, cache, or a field added later) is dropped.
 */

const {
  GuardrailsPipeline,
} = require("../../../src/guardrails/guardrails-pipeline");

const ALLOWED = [
  "token",
  "done",
  "success",
  "error",
  "timing",
  "cache",
  "route",
  "packing",
  "citations",
  "evaluation",
  "guardrails",
];

function wrapped(tokens, done) {
  return {
    run: async () =>
      (async function* stream() {
        for (const token of tokens) yield { token, done: false };
        yield { token: "", done: true, ...done };
      })(),
  };
}

function guarded(pipeline) {
  return new GuardrailsPipeline(pipeline, {
    preRetrieval: { enableInjectionDetection: false },
    retrieval: false,
    postGeneration: { enablePIIDetection: true },
  });
}

async function doneChunkOf(stream) {
  let last;
  for await (const chunk of stream) last = chunk;
  return last;
}

const extraDone = {
  success: true,
  timing: { firstTokenMs: 1, totalMs: 2 },
  results: [{ id: "d1", content: "Contact alice@corp.example for payroll." }],
  cache: { embeddings: "miss", retrieval: "hit", generation: "skip" },
  futureField: { text: "document text from a later version" },
  citations: { citations: [{ sentence: "The office opens at nine." }] },
};

describe("guarded stream done chunk", () => {
  test("keeps only the allowed fields when the answer has text", async () => {
    const g = guarded(wrapped(["The office opens at nine."], extraDone));
    const done = await doneChunkOf(
      await g.run({ query: "when?", options: { stream: true } }),
    );

    expect(done.done).toBe(true);
    expect(done.success).toBe(true);
    expect(done.timing).toEqual({ firstTokenMs: 1, totalMs: 2 });
    expect(done.citations).toBeDefined();
    expect(Object.keys(done).filter((k) => !ALLOWED.includes(k))).toEqual([]);
    expect(done).not.toHaveProperty("results");
    expect(done).not.toHaveProperty("futureField");
    // The per-layer hit/miss flags pass, so CostTracker sees a cache hit
    expect(done.cache).toEqual({
      embeddings: "miss",
      retrieval: "hit",
      generation: "skip",
    });
    expect(JSON.stringify(done)).not.toContain("alice@corp.example");
  });

  test("keeps only the allowed fields when the answer is empty", async () => {
    const g = guarded(wrapped([], extraDone));
    const done = await doneChunkOf(
      await g.run({ query: "when?", options: { stream: true } }),
    );

    expect(done.done).toBe(true);
    expect(Object.keys(done).filter((k) => !ALLOWED.includes(k))).toEqual([]);
    expect(JSON.stringify(done)).not.toContain("alice@corp.example");
    expect(JSON.stringify(done)).not.toContain("document text");
  });

  test("passes only known cache layers with a status string or boolean", async () => {
    const g = guarded(
      wrapped(["The office opens at nine."], {
        cache: {
          generation: "hit",
          retrieval: { docs: [{ content: "alice@corp.example" }] },
          embeddings: "Contact alice@corp.example for payroll.",
          extraLayer: "hit",
        },
      }),
    );
    const done = await doneChunkOf(
      await g.run({ query: "when?", options: { stream: true } }),
    );

    expect(done.cache).toEqual({ generation: "hit" });
    expect(JSON.stringify(done)).not.toContain("alice@corp.example");
  });

  test("drops a cache field that is not an object of flags", async () => {
    for (const cache of [
      "hit",
      ["hit"],
      { generation: { status: "hit" } },
      { retrieval: 42 },
    ]) {
      const g = guarded(wrapped(["The office opens at nine."], { cache }));
      const done = await doneChunkOf(
        await g.run({ query: "when?", options: { stream: true } }),
      );
      expect(done).not.toHaveProperty("cache");
    }
  });

  const route = {
    class: "simple",
    model: "gpt-4o-mini",
    estimatedCost: 0.0004,
  };
  const packing = {
    tokens: 812,
    maxTokens: 1000,
    kept: 3,
    dropped: 2,
    truncated: false,
  };

  async function doneWith(fields) {
    const g = guarded(wrapped(["The office opens at nine."], fields));
    return doneChunkOf(
      await g.run({ query: "when?", options: { stream: true } }),
    );
  }

  test("passes the router's decision and the packing counters", async () => {
    const done = await doneWith({
      route: { ...route, fallbackFrom: ["gpt-4o"] },
      packing,
    });
    expect(done.route).toEqual({ ...route, fallbackFrom: ["gpt-4o"] });
    expect(done.packing).toEqual(packing);
  });

  test("drops a route with a long, missing or non-string name, or no finite cost", async () => {
    for (const bad of [
      { ...route, class: "x".repeat(101) },
      { ...route, model: "Contact alice@corp.example ".repeat(5) },
      { ...route, model: 42 },
      { class: "simple", estimatedCost: 0.1 },
      { ...route, estimatedCost: Infinity },
      { ...route, estimatedCost: "0.1" },
      "simple",
      [route],
    ]) {
      const done = await doneWith({ route: bad });
      expect(done).not.toHaveProperty("route");
    }
    // 100 characters is still a name
    const long = await doneWith({
      route: { ...route, class: "x".repeat(100) },
    });
    expect(long.route.class).toHaveLength(100);
  });

  test("keeps only the known route fields and a valid fallbackFrom", async () => {
    const done = await doneWith({
      route: {
        ...route,
        fallbackFrom: ["gpt-4o", "y".repeat(101)],
        prompt: "Contact alice@corp.example",
      },
    });
    expect(done.route).toEqual(route);
    expect(JSON.stringify(done)).not.toContain("alice@corp.example");
  });

  test("keeps only packing's five fields with a number or boolean", async () => {
    const done = await doneWith({
      packing: {
        tokens: 812,
        kept: "3",
        dropped: NaN,
        truncated: true,
        documents: [{ content: "alice@corp.example" }],
      },
    });
    expect(done.packing).toEqual({ tokens: 812, truncated: true });
    expect(JSON.stringify(done)).not.toContain("alice@corp.example");

    for (const bad of ["812", [812], { kept: { n: 3 } }]) {
      const none = await doneWith({ packing: bad });
      expect(none).not.toHaveProperty("packing");
    }
  });
});
