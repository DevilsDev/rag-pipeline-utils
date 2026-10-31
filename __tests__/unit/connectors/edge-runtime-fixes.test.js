"use strict";

/**
 * Fixes found running the library in Cloudflare Workers (test/edge runs the
 * real runtime): streamed bodies arrive as web streams of bytes, fetch must
 * be called unbound from an object, and bundles have no require.resolve.
 */

const { textChunks } = require("../../../src/connectors/connector-utils");
const { loadOptionalPeer } = require("../../../src/utils/optional-peer");

async function collect(iterable) {
  const out = [];
  for await (const x of iterable) out.push(x);
  return out;
}

/** A web ReadableStream of the text's UTF-8 bytes, `size` bytes a chunk. */
function byteStream(text, size) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += size) {
        controller.enqueue(bytes.slice(i, i + size));
      }
      controller.close();
    },
  });
}

describe("textChunks", () => {
  const TEXT = "Ünïcödé café — 二十日";

  test("decodes a web ReadableStream of bytes split inside characters", async () => {
    const chunks = await collect(textChunks(byteStream(TEXT, 3)));
    expect(chunks.join("")).toBe(TEXT);
    expect(chunks.length).toBeGreaterThan(1);
  });

  test("decodes Node Buffers split inside characters", async () => {
    const bytes = Buffer.from(TEXT);
    async function* buffers() {
      for (let i = 0; i < bytes.length; i += 2) yield bytes.subarray(i, i + 2);
    }
    expect((await collect(textChunks(buffers()))).join("")).toBe(TEXT);
  });

  test("passes strings through, including a whole-body string", async () => {
    async function* strings() {
      yield "a";
      yield "b";
    }
    expect(await collect(textChunks(strings()))).toEqual(["a", "b"]);
    expect(await collect(textChunks("whole body"))).toEqual(["whole body"]);
    expect(await collect(textChunks(""))).toEqual([]);
  });

  test("reads a ReadableStream that has no async iterator", async () => {
    const stream = byteStream(TEXT, 4);
    const readerOnly = { getReader: () => stream.getReader() };
    expect((await collect(textChunks(readerOnly))).join("")).toBe(TEXT);
  });
});

describe("AnthropicConnector.generateStream over a web stream", () => {
  test("yields the tokens of an SSE body delivered as bytes", async () => {
    const {
      AnthropicConnector,
    } = require("../../../src/connectors/anthropic-connector");
    const sse = [
      { type: "content_block_delta", delta: { text: "Vingt " } },
      { type: "content_block_delta", delta: { text: "jours — été" } },
      { type: "message_stop" },
    ]
      .map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
      .join("");
    const llm = new AnthropicConnector({ apiKey: "k" });
    jest
      .spyOn(llm.client, "post")
      .mockResolvedValue({ data: byteStream(sse, 5) });

    const chunks = await collect(llm.generateStream("q"));

    expect(chunks.map((c) => c.token).join("")).toBe("Vingt jours — été");
    expect(chunks.at(-1)).toEqual({ token: "", done: true });
  });
});

describe("OllamaConnector.generateStream over a web stream", () => {
  test("yields the tokens of an NDJSON body delivered as bytes", async () => {
    const {
      OllamaConnector,
    } = require("../../../src/connectors/ollama-connector");
    const body =
      [
        '{"response":"Vingt ","done":false}',
        '{"response":"jours","done":true}',
      ].join("\n") + "\n";
    const llm = new OllamaConnector();
    jest
      .spyOn(llm.client, "post")
      .mockResolvedValue({ data: byteStream(body, 6) });

    const chunks = await collect(llm.generateStream("q"));

    expect(chunks.map((c) => c.token).join("")).toBe("Vingt jours");
  });
});

describe("QdrantRetriever with the global fetch", () => {
  test("calls fetch unbound from the retriever (Workers reject that)", async () => {
    const {
      QdrantRetriever,
    } = require("../../../src/retrieval/qdrant-retriever");
    const original = globalThis.fetch;
    const seen = [];
    // Like workerd's fetch: only callable with globalThis (or undefined) as this.
    globalThis.fetch = function fetch() {
      seen.push(this);
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      return Promise.resolve({
        status: 200,
        ok: true,
        statusText: "",
        text: async () =>
          JSON.stringify({
            result: {
              points: [{ id: 1, score: 0.5, payload: { content: "x" } }],
            },
          }),
      });
    };
    try {
      const q = new QdrantRetriever({
        url: "http://qdrant.test",
        createCollection: false,
      });
      const results = await q.retrieve({ queryVector: [0.1], topK: 1 });
      expect(results.map((r) => r.content)).toEqual(["x"]);
      expect(seen.length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = original;
    }
  });

  test("a fetch passed in options is called as given", async () => {
    const {
      QdrantRetriever,
    } = require("../../../src/retrieval/qdrant-retriever");
    const fetch = jest.fn(async () => ({
      status: 200,
      ok: true,
      statusText: "",
      text: async () => JSON.stringify({ result: { points: [] } }),
    }));
    const q = new QdrantRetriever({
      url: "http://qdrant.test",
      createCollection: false,
      fetch,
    });
    await q.retrieve({ queryVector: [0.1], topK: 1 });
    expect(fetch).toHaveBeenCalled();
  });
});

describe("loadOptionalPeer", () => {
  const notFound = (name) => {
    const e = new Error(`Cannot find module '${name}'\nRequire stack:\n- x.js`);
    e.code = "MODULE_NOT_FOUND";
    return e;
  };

  test("returns the module when it loads (bundles have no require.resolve)", () => {
    const mod = { ok: true };
    expect(loadOptionalPeer("pkg", () => mod, "hint")).toBe(mod);
  });

  test("a missing package becomes MISSING_DEPENDENCY with the hint", () => {
    expect(() =>
      loadOptionalPeer(
        "@scope/pkg",
        () => {
          throw notFound("@scope/pkg");
        },
        "npm install @scope/pkg",
      ),
    ).toThrow(
      expect.objectContaining({
        code: "MISSING_DEPENDENCY",
        message: "npm install @scope/pkg",
      }),
    );
  });

  test("a module missing inside the package is rethrown as is", () => {
    const inner = notFound("some-inner-module");
    let thrown;
    try {
      loadOptionalPeer(
        "pkg",
        () => {
          throw inner;
        },
        "hint",
      );
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBe(inner);
  });

  test("other load errors are rethrown as is", () => {
    const boom = new SyntaxError("Unexpected token");
    expect(() =>
      loadOptionalPeer(
        "pkg",
        () => {
          throw boom;
        },
        "hint",
      ),
    ).toThrow(boom);
  });
});
