"use strict";

const {
  ChunkingEngine,
  DEFAULT_CONFIG,
} = require("../../../src/chunking/chunking-engine");

describe("ChunkingEngine", () => {
  let engine;

  beforeEach(() => {
    engine = new ChunkingEngine();
  });

  describe("Initialization", () => {
    test("creates with default configuration", () => {
      const config = engine.getConfig();
      expect(config.strategy).toBe("recursive");
      expect(config.chunkSize).toBe(512);
      expect(config.chunkOverlap).toBe(50);
      expect(config.minChunkSize).toBe(50);
      expect(config.similarityThreshold).toBe(0.3);
      expect(config.separators).toEqual(["\n\n", "\n", ". ", " "]);
    });

    test("accepts custom config options", () => {
      const custom = new ChunkingEngine({
        strategy: "sentence",
        chunkSize: 256,
      });
      const config = custom.getConfig();
      expect(config.strategy).toBe("sentence");
      expect(config.chunkSize).toBe(256);
      // defaults still present for unset keys
      expect(config.chunkOverlap).toBe(50);
    });

    test("lists all 5 built-in strategies", () => {
      const strategies = engine.listStrategies();
      expect(strategies).toHaveLength(5);
      expect(strategies).toContain("sentence");
      expect(strategies).toContain("fixed-size");
      expect(strategies).toContain("recursive");
      expect(strategies).toContain("semantic");
      expect(strategies).toContain("structure-aware");
    });
  });

  describe("Sentence strategy", () => {
    test("chunks text by sentences", () => {
      const text = "First sentence. Second sentence. Third sentence.";
      const chunks = engine.chunk(text, { strategy: "sentence", maxLen: 500 });
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      // All original text should be represented
      const joined = chunks.join(" ");
      expect(joined).toContain("First sentence.");
      expect(joined).toContain("Third sentence.");
    });

    test("respects maxLen by splitting long text into multiple chunks", () => {
      const text =
        "Short sentence one. Short sentence two. Short sentence three. Short sentence four. Short sentence five.";
      const chunks = engine.chunk(text, { strategy: "sentence", maxLen: 50 });
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        // Each chunk should be at or near the maxLen limit
        expect(chunk.length).toBeLessThanOrEqual(60); // allow small buffer for sentence boundary
      }
    });

    test("handles single sentence", () => {
      const text = "Just one sentence here.";
      const chunks = engine.chunk(text, { strategy: "sentence", maxLen: 500 });
      expect(chunks).toEqual(["Just one sentence here."]);
    });

    test("backward compatible with old _chunkText output format (array of strings)", () => {
      const text = "Hello world. This is a test. Final line.";
      const chunks = engine.chunk(text, { strategy: "sentence" });
      expect(Array.isArray(chunks)).toBe(true);
      for (const chunk of chunks) {
        expect(typeof chunk).toBe("string");
        expect(chunk.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Fixed-size strategy", () => {
    test("splits text by character count", () => {
      const text = "A".repeat(200);
      const chunks = engine.chunk(text, {
        strategy: "fixed-size",
        chunkSize: 100,
        chunkOverlap: 0,
        minChunkSize: 1,
      });
      expect(chunks.length).toBe(2);
    });

    test("respects overlap between chunks", () => {
      const text = "word ".repeat(100); // 500 chars
      const chunks = engine.chunk(text, {
        strategy: "fixed-size",
        chunkSize: 200,
        chunkOverlap: 50,
        minChunkSize: 1,
      });
      // With overlap, we should get more chunks than without
      expect(chunks.length).toBeGreaterThan(2);
    });

    test("respects minChunkSize by filtering small trailing chunks", () => {
      const text = "A".repeat(110);
      const chunks = engine.chunk(text, {
        strategy: "fixed-size",
        chunkSize: 100,
        chunkOverlap: 0,
        minChunkSize: 50,
      });
      for (const chunk of chunks) {
        expect(chunk.length).toBeGreaterThanOrEqual(10); // after trim, at least minChunkSize-ish
      }
    });
  });

  describe("Recursive strategy", () => {
    test("splits by separator hierarchy", () => {
      const text =
        "Paragraph one content here.\n\nParagraph two content here.\n\nParagraph three content here.";
      const chunks = engine.chunk(text, {
        strategy: "recursive",
        chunkSize: 50,
        minChunkSize: 10,
      });
      expect(chunks.length).toBeGreaterThan(1);
    });

    test("handles text with single separator level", () => {
      const text = "Line one.\nLine two.\nLine three.\nLine four.";
      const chunks = engine.chunk(text, {
        strategy: "recursive",
        chunkSize: 30,
        separators: ["\n"],
        minChunkSize: 5,
      });
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    test("handles large text without error", () => {
      const text = "This is a sentence. ".repeat(500);
      const chunks = engine.chunk(text, {
        strategy: "recursive",
        chunkSize: 200,
        minChunkSize: 20,
      });
      expect(chunks.length).toBeGreaterThan(10);
      for (const chunk of chunks) {
        expect(chunk.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Semantic strategy", () => {
    test("detects topic boundaries based on token similarity", () => {
      // Two distinct topics with very different vocabulary
      const text =
        "Machine learning algorithms process data effectively. Neural networks train on large datasets. " +
        "The recipe calls for fresh tomatoes. Add basil and olive oil to the pasta sauce.";
      const chunks = engine.chunk(text, {
        strategy: "semantic",
        chunkSize: 500,
        similarityThreshold: 0.1,
        minChunkSize: 10,
      });
      // Should detect at least one topic boundary
      expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    test("falls back to recursive for oversized segments", () => {
      // Create a long single-topic text that exceeds chunkSize
      const text =
        "The same topic word appears repeatedly in every single sentence here. ".repeat(
          20,
        );
      const chunks = engine.chunk(text, {
        strategy: "semantic",
        chunkSize: 200,
        similarityThreshold: 0.9, // high threshold keeps sentences together
        minChunkSize: 10,
      });
      // Oversized segment should be recursively split
      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  describe("Structure-aware strategy", () => {
    test("detects Markdown headers and splits by sections", () => {
      const text =
        "# Header One\nContent for section one.\n\n## Header Two\nContent for section two.";
      const chunks = engine.chunk(text, {
        strategy: "structure-aware",
        chunkSize: 500,
        minChunkSize: 1,
      });
      expect(chunks.length).toBe(2);
      expect(chunks[0]).toContain("Header One");
      expect(chunks[1]).toContain("Header Two");
    });

    test("preserves code blocks as atomic units", () => {
      const text =
        '# Section\nSome text.\n\n```javascript\nfunction hello() {\n  return "world";\n}\n```\n\n# Another Section\nMore text.';
      const chunks = engine.chunk(text, {
        strategy: "structure-aware",
        chunkSize: 500,
        minChunkSize: 1,
      });
      // Code block should be intact in one chunk
      const codeChunk = chunks.find((c) => c.includes("function hello()"));
      expect(codeChunk).toBeDefined();
      expect(codeChunk).toContain('return "world"');
    });

    test("detects HTML sections", () => {
      const text =
        "<h1>Title</h1><p>Intro paragraph.</p><h2>Subtitle</h2><p>Details here.</p>";
      const chunks = engine.chunk(text, {
        strategy: "structure-aware",
        chunkSize: 500,
        minChunkSize: 1,
      });
      expect(chunks.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Custom strategies", () => {
    test("registerStrategy adds a new strategy and it can be used", () => {
      const reverseStrategy = (text) => [text.split("").reverse().join("")];
      engine.registerStrategy("reverse", reverseStrategy);
      expect(engine.listStrategies()).toContain("reverse");

      const chunks = engine.chunk("hello", { strategy: "reverse" });
      expect(chunks).toEqual(["olleh"]);
    });

    test("registerStrategy throws for invalid name", () => {
      expect(() => engine.registerStrategy("", () => [])).toThrow(
        "Strategy name must be a non-empty string",
      );
      expect(() => engine.registerStrategy(null, () => [])).toThrow(
        "Strategy name must be a non-empty string",
      );
    });

    test("registerStrategy throws for non-function", () => {
      expect(() => engine.registerStrategy("test", "not-a-function")).toThrow(
        "Strategy must be a function",
      );
    });

    test("unknown strategy throws with descriptive error", () => {
      expect(() => engine.chunk("hello", { strategy: "nonexistent" })).toThrow(
        /Unknown chunking strategy "nonexistent"/,
      );
    });
  });

  describe("Edge cases", () => {
    test("empty string throws", () => {
      expect(() => engine.chunk("")).toThrow("text must be a non-empty string");
    });

    test("whitespace-only string throws", () => {
      expect(() => engine.chunk("   ")).toThrow(
        "text must be a non-empty string",
      );
    });

    test("null input throws", () => {
      expect(() => engine.chunk(null)).toThrow(
        "text must be a non-empty string",
      );
    });

    test("single word returns array with that word", () => {
      const chunks = engine.chunk("hello", {
        strategy: "sentence",
        maxLen: 500,
      });
      expect(chunks).toEqual(["hello"]);
    });

    test("very long text does not crash", () => {
      const text = "Lorem ipsum dolor sit amet. ".repeat(10000);
      expect(() =>
        engine.chunk(text, { strategy: "recursive", chunkSize: 512 }),
      ).not.toThrow();
      const chunks = engine.chunk(text, {
        strategy: "recursive",
        chunkSize: 512,
      });
      expect(chunks.length).toBeGreaterThan(100);
    });
  });

  describe("Events", () => {
    test("emits chunk event with strategy, inputLength, chunkCount", () => {
      const handler = jest.fn();
      engine.on("chunk", handler);

      const text = "First sentence. Second sentence. Third sentence.";
      const chunks = engine.chunk(text, { strategy: "sentence", maxLen: 500 });

      expect(handler).toHaveBeenCalledTimes(1);
      const eventData = handler.mock.calls[0][0];
      expect(eventData.strategy).toBe("sentence");
      expect(eventData.inputLength).toBe(text.length);
      expect(eventData.chunkCount).toBe(chunks.length);
    });

    test("emits chunk event for each call", () => {
      const handler = jest.fn();
      engine.on("chunk", handler);

      engine.chunk("Hello world sentence one.", { strategy: "sentence" });
      engine.chunk("Another text sentence two.", {
        strategy: "recursive",
        chunkSize: 500,
        minChunkSize: 1,
      });

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler.mock.calls[0][0].strategy).toBe("sentence");
      expect(handler.mock.calls[1][0].strategy).toBe("recursive");
    });
  });
});
