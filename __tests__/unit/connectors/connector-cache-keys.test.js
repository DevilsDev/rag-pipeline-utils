"use strict";

const {
  normalizeCacheOption,
  PipelineCache,
} = require("../../../src/cache/pipeline-cache");
const { CohereConnector } = require("../../../src/connectors/cohere-connector");
const {
  AnthropicConnector,
} = require("../../../src/connectors/anthropic-connector");
const { OpenAIConnector } = require("../../../src/connectors/openai-connector");

const KEY_A = "sk-test-AAAA-1234567890";
const KEY_B = "sk-test-BBBB-1234567890";

describe.each([
  ["Cohere", (k) => new CohereConnector({ apiKey: k }), "embedder", "embedder"],
  [
    "Anthropic",
    (k) => new AnthropicConnector({ apiKey: k }),
    "llm",
    "generation",
  ],
  [
    "OpenAI embedder",
    (k) => new OpenAIConnector({ apiKey: k }),
    "embedder",
    "embedder",
  ],
  [
    "OpenAI llm",
    (k) => new OpenAIConnector({ apiKey: k }),
    "llm",
    "generation",
  ],
])("%s cache identity", (_n, make, role) => {
  test("different API keys give different cache keys; the key never appears", () => {
    const a = make(KEY_A).getCacheKey(role);
    const b = make(KEY_B).getCacheKey(role);
    expect(a).not.toBe(b);
    for (const k of [a, b]) {
      expect(k).not.toContain(KEY_A);
      expect(k).not.toContain(KEY_B);
      expect(k).not.toContain("AAAA");
    }
  });

  test("the same key gives the same cache key", () => {
    expect(make(KEY_A).getCacheKey(role)).toBe(make(KEY_A).getCacheKey(role));
  });
});

test("pipeline cache entries differ between connectors that differ only in apiKey", () => {
  const layers = () => normalizeCacheOption(true);
  const a = new PipelineCache(layers(), {
    embedder: new CohereConnector({ apiKey: KEY_A }),
  });
  const b = new PipelineCache(layers(), {
    embedder: new CohereConnector({ apiKey: KEY_B }),
  });
  const a2 = new PipelineCache(layers(), {
    embedder: new CohereConnector({ apiKey: KEY_A }),
  });
  expect(a.embeddingKey("hello")).not.toBe(b.embeddingKey("hello"));
  expect(a.embeddingKey("hello")).toBe(a2.embeddingKey("hello"));
});

test("without a key the identity carries no key part", () => {
  const noKey = new OpenAIConnector({
    apiKey: "",
    baseURL: "http://localhost:1234/v1",
  });
  expect(noKey.getCacheKey("llm")).not.toMatch(/keyId/);
});
