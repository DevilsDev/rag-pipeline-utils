"use strict";

const {
  HashEmbedder,
  EchoLLM,
  fixtures,
  createTestPipeline,
} = require("../../../src/testing");
const { validatePlugin } = require("../../../src/index");

describe("HashEmbedder", () => {
  test("is deterministic, normalised and ranks shared words higher", async () => {
    const e = new HashEmbedder({ dimensions: 64 });
    const a = await e.embed("paid vacation days");
    expect(await e.embed("paid vacation days")).toEqual(a);
    expect(a).toHaveLength(64);
    expect(Math.hypot(...a)).toBeCloseTo(1, 10);

    const cosine = (x, y) => x.reduce((s, v, i) => s + v * y[i], 0);
    const near = await e.embed("vacation days");
    const far = await e.embed("travel receipts");
    expect(cosine(a, near)).toBeGreaterThan(cosine(a, far));
    expect(await e.embedBatch(["paid vacation days"])).toEqual([a]);
  });

  test("honours an aborted signal and validates dimensions", async () => {
    const controller = new AbortController();
    controller.abort(new Error("stop"));
    await expect(
      new HashEmbedder().embed("x", { signal: controller.signal }),
    ).rejects.toThrow("stop");
    expect(() => new HashEmbedder({ dimensions: 0 })).toThrow(
      /positive integer/,
    );
  });
});

describe("HashEmbedder ranking", () => {
  // FNV-1a alone gave "above" and "vacation" the same low bits, so the
  // query "vacation" ranked the expenses document first. Mixed hashing fixes
  // it at every size.
  test.each([128, 256, 1024])(
    "ranks the fixtures correctly at %i dimensions",
    async (dimensions) => {
      const { pipeline } = await createTestPipeline({
        embedder: new HashEmbedder({ dimensions }),
        llm: null,
      });
      const cases = [
        ["vacation", "vacation"],
        ["How many vacation days do I get?", "vacation"],
        ["paid", "vacation"],
        ["work remotely", "remote-work"],
        ["manager approval", "remote-work"],
        ["receipts", "expenses"],
        ["expense limit for travel", "expenses"],
      ];
      for (const [query, expected] of cases) {
        const result = await pipeline.run({ query });
        expect([query, result.results[0].id]).toEqual([query, expected]);
      }
    },
  );
});

describe("EchoLLM", () => {
  test("echoes the top document and records calls", async () => {
    const llm = new EchoLLM();
    await expect(
      llm.generate("q", [{ content: "top" }, { content: "2nd" }]),
    ).resolves.toBe("top");
    await expect(llm.generate("q", [])).resolves.toBe("No information found.");
    expect(llm.calls.map((c) => c.query)).toEqual(["q", "q"]);
  });

  test("returns a fixed or computed answer and streams it", async () => {
    expect(await new EchoLLM({ answer: "fixed" }).generate("q", [])).toBe(
      "fixed",
    );
    const computed = new EchoLLM({
      answer: (q, docs) => `${q}:${docs.length}`,
    });
    expect(await computed.generate("hello", [1, 2])).toBe("hello:2");

    const chunks = [];
    for await (const c of new EchoLLM({
      answer: "one two three",
    }).generateStream("q", [])) {
      chunks.push(c);
    }
    expect(chunks.map((c) => c.token).join("")).toBe("one two three");
    expect(chunks.at(-1)).toEqual({ token: "", done: true });
  });

  test("both helpers pass the plugin registry rules", () => {
    expect(
      validatePlugin("embedder", new HashEmbedder(), { registry: true }).valid,
    ).toBe(true);
    expect(validatePlugin("llm", new EchoLLM(), { registry: true }).valid).toBe(
      true,
    );
  });
});

describe("createTestPipeline", () => {
  test("retrieves the right fixture and answers from it", async () => {
    const { pipeline, llm } = await createTestPipeline();
    const result = await pipeline.run({
      query: "How many vacation days do I get?",
      options: { citations: true },
    });
    expect(result.results[0].id).toBe("vacation");
    expect(result.answer).toBe(fixtures.documents[0].content);
    expect(result.citations.groundednessScore).toBe(1);
    expect(llm.calls).toHaveLength(1);
  });

  test("takes your documents and llm, or none for retrieval only", async () => {
    const { pipeline, llm } = await createTestPipeline({
      documents: [{ id: "a", content: "Cats sleep a lot." }],
      llm: null,
    });
    expect(llm).toBeNull();
    const result = await pipeline.run({ query: "cats" });
    expect(result.results[0].id).toBe("a");
    expect(result.answer).toBeNull();
  });

  test("fixtures cannot be changed by accident", () => {
    expect(Object.isFrozen(fixtures.documents)).toBe(true);
    expect(Object.isFrozen(fixtures.documents[0])).toBe(true);
  });
});
