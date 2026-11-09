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

describe("fixed-size chunker", () => {
  const {
    fixedSizeChunk,
  } = require("../../../src/chunking/strategies/fixed-size");
  const words = Array.from({ length: 60 }, (_, i) => `word${i}`);

  test.each([0, 5, 10, 19])(
    "every word survives with overlap %i",
    (chunkOverlap) => {
      const text = words.join(" ");
      const chunks = fixedSizeChunk(text, {
        chunkSize: 60,
        chunkOverlap,
        minChunkSize: 1,
      });
      const seen = new Set(chunks.join(" ").split(/\s+/));
      for (const w of words) expect(seen.has(w)).toBe(true);
    },
  );

  test("does not split an emoji", () => {
    const text = "\u{1F600}".repeat(300);
    const chunks = fixedSizeChunk(text, {
      chunkSize: 51,
      chunkOverlap: 5,
      minChunkSize: 1,
    });
    for (const c of chunks) {
      expect(c).not.toMatch(/^[\udc00-\udfff]|[\ud800-\udbff]$/);
    }
  });

  test("overlap larger than half of chunkSize is rejected", () => {
    expect(() =>
      fixedSizeChunk("a ".repeat(500), { chunkSize: 100, chunkOverlap: 99 }),
    ).toThrow(/chunkOverlap/);
  });

  test("1 MB of text with a valid overlap produces a bounded chunk count", () => {
    const text = "abcdefghi ".repeat(100000);
    const chunks = fixedSizeChunk(text, { chunkSize: 512, chunkOverlap: 50 });
    expect(chunks.length).toBeLessThan(text.length / 400);
  });

  test("a short document is kept", () => {
    expect(fixedSizeChunk("tiny", { minChunkSize: 50 })).toEqual(["tiny"]);
  });
});

describe("recursive chunker overlap", () => {
  const words = Array.from({ length: 80 }, (_, i) => `w${i}x`);
  const text = words.join(" ");

  test("overlap is made of whole words, never glued or cut", () => {
    const chunks = recursiveChunk(text, {
      chunkSize: 60,
      chunkOverlap: 15,
      minChunkSize: 1,
    });
    expect(chunks.length).toBeGreaterThan(2);
    const valid = new Set(words);
    for (const c of chunks) {
      for (const w of c.split(/\s+/)) expect(valid.has(w)).toBe(true);
    }
    // where there was room, a chunk starts with words that ended the previous one
    const overlapping = chunks.filter(
      (c, i) => i > 0 && chunks[i - 1].split(/\s+/).includes(c.split(/\s+/)[0]),
    );
    expect(overlapping.length).toBeGreaterThan(0);
  });

  test("chunks with overlap never exceed chunkSize", () => {
    const chunks = recursiveChunk(text, {
      chunkSize: 60,
      chunkOverlap: 30,
      minChunkSize: 1,
    });
    expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(60);
  });

  test("no word of the text is lost", () => {
    const chunks = recursiveChunk(text, {
      chunkSize: 60,
      chunkOverlap: 15,
      minChunkSize: 1,
    });
    const seen = new Set(chunks.join(" ").split(/\s+/));
    for (const w of words) expect(seen.has(w)).toBe(true);
  });
});
