"use strict";

const { ChunkingEngine } = require("../../../src/chunking/chunking-engine");
const {
  recursiveChunk,
} = require("../../../src/chunking/strategies/recursive");

describe("recursive chunker keeps all text", () => {
  test("text with no separators is cut into consecutive slices, nothing lost", () => {
    const text = "\u4e2d".repeat(1800);
    const chunks = recursiveChunk(text, { chunkSize: 512, chunkOverlap: 0 });
    expect(chunks.join("")).toBe(text);
    expect(chunks.every((c) => c.length <= 512)).toBe(true);
  });

  test("hard cut does not split an emoji", () => {
    const text = "\u{1F600}".repeat(400);
    const chunks = recursiveChunk(text, {
      chunkSize: 101,
      chunkOverlap: 0,
      minChunkSize: 1,
    });
    expect(chunks.join("")).toBe(text);
    for (const c of chunks) {
      expect(Array.from(c).join("")).toBe(c);
      expect(c).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    }
  });

  test("a short document is never dropped by minChunkSize", () => {
    expect(recursiveChunk("tiny note", { minChunkSize: 50 })).toEqual([
      "tiny note",
    ]);
    const engine = new ChunkingEngine();
    expect(engine.chunk("tiny note")).toEqual(["tiny note"]);
  });
});
