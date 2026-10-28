"use strict";

const { validatePlugin } = require("../../../src/core/validate-plugin");
const { PluginRegistry } = require("../../../src/core/plugin-registry");
const {
  MemoryRetriever,
  LocalEmbedder,
  ScoringReranker,
} = require("../../../src/index");

const metadata = (type) => ({ name: `my-${type}`, version: "1.0.0", type });

describe("validatePlugin", () => {
  test("accepts what createRagPipeline needs", () => {
    expect(validatePlugin("llm", { generate: async () => "x" })).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    });
    // An embedder needs embed() or embedQuery(), not both.
    expect(
      validatePlugin("embedder", { embedQuery: async () => [1] }).valid,
    ).toBe(true);
  });

  test("reports a missing stage method", () => {
    const result = validatePlugin("retriever", { store: async () => {} });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(["A retriever needs retrieve()"]);
  });

  test("warns about methods only some commands need", () => {
    const result = validatePlugin("embedder", { embedQuery: async () => [1] });
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([
      "No embed() method: `ingest` calls embed() to embed documents",
    ]);
  });

  test("rejects unknown stages and non-objects without throwing", () => {
    expect(validatePlugin("vectorizer", {}).errors[0]).toMatch(
      /Unknown stage "vectorizer"/,
    );
    expect(validatePlugin("llm", null).valid).toBe(false);
    expect(validatePlugin("llm", "generate").valid).toBe(false);
  });

  test("built-in components pass for their stage", () => {
    expect(validatePlugin("retriever", new MemoryRetriever()).valid).toBe(true);
    expect(validatePlugin("embedder", new LocalEmbedder()).valid).toBe(true);
    expect(validatePlugin("reranker", new ScoringReranker()).valid).toBe(true);
  });

  describe("{ registry: true }", () => {
    test("adds pluginRegistry.register() metadata rules", () => {
      const result = validatePlugin(
        "llm",
        { generate: async () => "x" },
        { registry: true },
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual([
        "pluginRegistry.register(): Plugin missing metadata property",
      ]);
    });

    test("checks the metadata type matches the stage", () => {
      const result = validatePlugin(
        "llm",
        { metadata: metadata("embedder"), generate: async () => "x" },
        { registry: true },
      );
      expect(result.errors).toEqual([
        "pluginRegistry.register(): Plugin metadata type must be 'llm'",
      ]);
    });

    test("agrees with pluginRegistry.register()", async () => {
      const plugins = [
        ["llm", { metadata: metadata("llm"), generate: async () => "x" }],
        ["llm", { generate: async () => "x" }],
        [
          "retriever",
          { metadata: metadata("retriever"), retrieve: async () => [] },
        ],
        [
          "retriever",
          {
            metadata: metadata("retriever"),
            store: async () => {},
            retrieve: async () => [],
          },
        ],
      ];
      for (const [stage, plugin] of plugins) {
        const registry = new PluginRegistry();
        let registered = true;
        try {
          await registry.register(stage, plugin.metadata?.name || "p", plugin);
        } catch {
          registered = false;
        }
        expect([
          stage,
          validatePlugin(stage, plugin, { registry: true }).valid,
        ]).toEqual([stage, registered]);
      }
    });
  });
});
