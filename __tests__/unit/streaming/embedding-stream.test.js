"use strict";

const {
  createEmbeddingStream,
} = require("../../../src/streaming/embedding-stream");
const {
  StreamingEmbedder,
} = require("../../../src/streaming/streaming-embedder");

const docs = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: `d${i}`, content: `doc ${i}` }));
const vec = (text) => [text.length, Number(text.split(" ")[1]) || 0];

async function collect(stream) {
  const out = [];
  for await (const e of stream) out.push(e);
  return out;
}

describe("createEmbeddingStream", () => {
  test("a string-only embedder gets one text at a time and returns the right vectors", async () => {
    const seen = [];
    const embedder = {
      async embed(text) {
        seen.push(text);
        if (typeof text !== "string") throw new Error("expects a string");
        return vec(text);
      },
    };
    const out = await collect(createEmbeddingStream(docs(4), embedder));
    expect(seen).toEqual(["doc 0", "doc 1", "doc 2", "doc 3"]);
    expect(out.map((e) => e.vector)).toEqual(
      [0, 1, 2, 3].map((i) => vec(`doc ${i}`)),
    );
  });

  test("embedBatch is used when the embedder has it", async () => {
    const batches = [];
    const embedder = {
      async embed() {
        throw new Error("should not be called");
      },
      async embedBatch(texts) {
        batches.push(texts.length);
        return texts.map(vec);
      },
    };
    const out = await collect(
      createEmbeddingStream(docs(5), embedder, { batchSize: 2 }),
    );
    expect(batches).toEqual([2, 2, 1]);
    expect(out.map((e) => e.vector)).toEqual(
      docs(5).map((d) => vec(d.content)),
    );
  });

  test("an embedder that only takes arrays still works", async () => {
    const embedder = {
      async embed(texts) {
        if (!Array.isArray(texts))
          throw new Error("embed() expects an array of strings");
        return texts.map(vec);
      },
    };
    const out = await collect(createEmbeddingStream(docs(3), embedder));
    expect(out.map((e) => e.vector)).toEqual(
      docs(3).map((d) => vec(d.content)),
    );
  });

  test("one failing document is reported and the others are still embedded", async () => {
    const embedder = {
      async embed(text) {
        if (text === "doc 1") throw new Error("rate limited");
        return vec(text);
      },
    };
    const out = await collect(createEmbeddingStream(docs(3), embedder));
    expect(out.map((e) => [e.id, Boolean(e.error)])).toEqual([
      ["d0", false],
      ["d1", true],
      ["d2", false],
    ]);
  });

  test("maxConcurrency bounds the calls in flight, and calls do overlap", async () => {
    let inFlight = 0;
    let peak = 0;
    const embedder = {
      async embed(text) {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 20));
        inFlight -= 1;
        return vec(text);
      },
    };
    const out = await collect(
      createEmbeddingStream(docs(8), embedder, {
        batchSize: 8,
        maxConcurrency: 3,
      }),
    );
    expect(out).toHaveLength(8);
    expect(out.map((e) => e.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBe(3);
  });
});

describe("StreamingEmbedder", () => {
  test("a failing document without an error listener does not end the stream", async () => {
    const embedder = {
      async embed(text) {
        if (text === "doc 1") throw new Error("rate limited");
        return vec(text);
      },
    };
    const se = new StreamingEmbedder(embedder, { batchSize: 10 });
    const out = await se.embedAll(docs(3));
    expect(out).toHaveLength(3);
    expect(se.getStats()).toMatchObject({ processed: 2, failed: 1 });
  });

  test("the error event is still emitted when there is a listener", async () => {
    const embedder = {
      async embed() {
        throw new Error("down");
      },
    };
    const se = new StreamingEmbedder(embedder);
    const seen = [];
    se.on("error", (e) => seen.push(e.id));
    await se.embedAll(docs(2));
    expect(seen).toEqual(["d0", "d1"]);
  });
});
