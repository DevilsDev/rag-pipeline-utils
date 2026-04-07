"use strict";

const { BaseConnector } = require("../../../src/connectors/base-connector");
const { LocalEmbedder } = require("../../../src/connectors/local-embedder");
const { MemoryRetriever } = require("../../../src/connectors/memory-retriever");
const { OpenAIConnector } = require("../../../src/connectors/openai-connector");
const {
  AnthropicConnector,
} = require("../../../src/connectors/anthropic-connector");
const { CohereConnector } = require("../../../src/connectors/cohere-connector");
const { OllamaConnector } = require("../../../src/connectors/ollama-connector");

describe("BaseConnector", () => {
  let connector;

  beforeEach(() => {
    connector = new BaseConnector({ name: "test-connector" });
  });

  describe("connect/disconnect lifecycle", () => {
    test("connect sets connected to true", async () => {
      expect(connector.connected).toBe(false);
      await connector.connect();
      expect(connector.connected).toBe(true);
    });

    test("disconnect sets connected to false", async () => {
      await connector.connect();
      await connector.disconnect();
      expect(connector.connected).toBe(false);
    });

    test("emits connected and disconnected events", async () => {
      const onConnected = jest.fn();
      const onDisconnected = jest.fn();
      connector.on("connected", onConnected);
      connector.on("disconnected", onDisconnected);

      await connector.connect();
      expect(onConnected).toHaveBeenCalledWith({ name: "test-connector" });

      await connector.disconnect();
      expect(onDisconnected).toHaveBeenCalledWith({ name: "test-connector" });
    });
  });

  describe("isHealthy()", () => {
    test("returns false when disconnected", async () => {
      expect(await connector.isHealthy()).toBe(false);
    });

    test("returns true when connected", async () => {
      await connector.connect();
      expect(await connector.isHealthy()).toBe(true);
    });
  });

  describe("getInfo()", () => {
    test("returns connector info", () => {
      const info = connector.getInfo();
      expect(info.name).toBe("test-connector");
      expect(info.connected).toBe(false);
      expect(info.type).toBe("BaseConnector");
    });
  });

  describe("withRetry()", () => {
    test("returns result on success", async () => {
      const fn = jest.fn().mockResolvedValue("ok");
      const result = await connector.withRetry(fn, 3, 1);
      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test("retries on failure and succeeds", async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error("fail1"))
        .mockRejectedValueOnce(new Error("fail2"))
        .mockResolvedValue("success");

      const result = await connector.withRetry(fn, 3, 1);
      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(3);
    });

    test("throws last error after all retries exhausted", async () => {
      const fn = jest.fn().mockRejectedValue(new Error("always fails"));
      await expect(connector.withRetry(fn, 2, 1)).rejects.toThrow(
        "always fails",
      );
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    test("emits retry event on each retry", async () => {
      const handler = jest.fn();
      connector.on("retry", handler);

      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValue("ok");

      await connector.withRetry(fn, 2, 1);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ attempt: 1, maxRetries: 2 }),
      );
    });
  });
});

describe("LocalEmbedder", () => {
  let embedder;

  beforeEach(() => {
    embedder = new LocalEmbedder();
  });

  describe("train()", () => {
    test("builds vocabulary from string documents", () => {
      embedder.train([
        "the cat sat on the mat",
        "the dog ran in the park",
        "cats and dogs are pets",
      ]);
      expect(embedder.getVocabularySize()).toBeGreaterThan(0);
    });

    test("builds vocabulary from object documents", () => {
      embedder.train([
        { content: "machine learning is useful" },
        { text: "deep learning models" },
      ]);
      expect(embedder.getVocabularySize()).toBeGreaterThan(0);
    });

    test("emits trained event", () => {
      const handler = jest.fn();
      embedder.on("trained", handler);
      embedder.train(["hello world", "foo bar"]);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ vocabSize: expect.any(Number), docCount: 2 }),
      );
    });
  });

  describe("embed()", () => {
    test("returns vector of correct length", () => {
      embedder.train(["hello world test", "another document here"]);
      const vector = embedder.embed("hello world");
      expect(Array.isArray(vector)).toBe(true);
      expect(vector.length).toBe(embedder.getVocabularySize());
    });

    test("returns L2-normalized vector", () => {
      embedder.train(["alpha beta gamma", "delta epsilon zeta"]);
      const vector = embedder.embed("alpha beta");

      // Check L2 norm is approximately 1
      const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
      if (magnitude > 0) {
        expect(magnitude).toBeCloseTo(1.0, 4);
      }
    });
  });

  describe("untrained embedder", () => {
    test("returns zero/empty vector without crash", () => {
      const vector = embedder.embed("some text");
      expect(Array.isArray(vector)).toBe(true);
      expect(vector.length).toBeGreaterThanOrEqual(1);
      expect(vector.every((v) => v === 0)).toBe(true);
    });

    test("emits warning when not trained", () => {
      const handler = jest.fn();
      embedder.on("warning", handler);
      embedder.embed("test");
      expect(handler).toHaveBeenCalled();
    });
  });

  describe("connect/isHealthy", () => {
    test("connect always succeeds", async () => {
      await embedder.connect();
      expect(embedder.connected).toBe(true);
    });

    test("isHealthy returns false when untrained", async () => {
      expect(await embedder.isHealthy()).toBe(false);
    });

    test("isHealthy returns true when trained", async () => {
      embedder.train(["test doc"]);
      expect(await embedder.isHealthy()).toBe(true);
    });
  });
});

describe("MemoryRetriever", () => {
  let retriever;

  beforeEach(() => {
    retriever = new MemoryRetriever();
  });

  describe("store()", () => {
    test("stores vectors", async () => {
      await retriever.store([
        { id: "doc1", vector: [1, 0, 0], content: "hello" },
        { id: "doc2", vector: [0, 1, 0], content: "world" },
      ]);
      const stats = retriever.getStats();
      expect(stats.documentCount).toBe(2);
    });

    test("emits stored event", async () => {
      const handler = jest.fn();
      retriever.on("stored", handler);
      await retriever.store([{ id: "doc1", vector: [1, 0], content: "test" }]);
      expect(handler).toHaveBeenCalledWith({ count: 1, total: 1 });
    });

    test("handles duplicate IDs by overwriting", async () => {
      await retriever.store([{ id: "doc1", vector: [1, 0], content: "first" }]);
      await retriever.store([
        { id: "doc1", vector: [0, 1], content: "second" },
      ]);
      const stats = retriever.getStats();
      expect(stats.documentCount).toBe(1);
    });
  });

  describe("retrieve()", () => {
    test("returns ranked results by cosine similarity", async () => {
      await retriever.store([
        { id: "doc1", vector: [1, 0, 0], content: "alpha" },
        { id: "doc2", vector: [0, 1, 0], content: "beta" },
        { id: "doc3", vector: [0.9, 0.1, 0], content: "gamma" },
      ]);

      const results = await retriever.retrieve([1, 0, 0], 3);
      expect(results.length).toBe(3);
      // doc1 should be most similar to [1,0,0]
      expect(results[0].id).toBe("doc1");
      expect(results[0].score).toBeCloseTo(1.0);
      // doc3 should be second most similar
      expect(results[1].id).toBe("doc3");
    });

    test("respects topK parameter", async () => {
      await retriever.store([
        { id: "doc1", vector: [1, 0], content: "a" },
        { id: "doc2", vector: [0, 1], content: "b" },
        { id: "doc3", vector: [0.5, 0.5], content: "c" },
      ]);

      const results = await retriever.retrieve([1, 0], 2);
      expect(results.length).toBe(2);
    });

    test("supports object query format", async () => {
      await retriever.store([{ id: "doc1", vector: [1, 0], content: "test" }]);

      const results = await retriever.retrieve({
        queryVector: [1, 0],
        topK: 1,
      });
      expect(results.length).toBe(1);
      expect(results[0].id).toBe("doc1");
    });

    test("handles empty store", async () => {
      const results = await retriever.retrieve([1, 0], 5);
      expect(results).toEqual([]);
    });
  });

  describe("clear()", () => {
    test("empties store", async () => {
      await retriever.store([{ id: "doc1", vector: [1, 0], content: "test" }]);
      await retriever.clear();
      expect(retriever.getStats().documentCount).toBe(0);
    });
  });

  describe("edge cases", () => {
    test("empty vectors return zero similarity", async () => {
      await retriever.store([
        { id: "doc1", vector: [0, 0, 0], content: "empty" },
      ]);
      const results = await retriever.retrieve([0, 0, 0], 1);
      expect(results[0].score).toBe(0);
    });
  });
});

describe("OpenAIConnector", () => {
  test("constructor sets config", () => {
    const connector = new OpenAIConnector({
      model: "gpt-4",
      apiKey: "test-key",
    });
    expect(connector.config.model).toBe("gpt-4");
    expect(connector.config.apiKey).toBe("test-key");
  });

  test("connect throws without API key", async () => {
    const connector = new OpenAIConnector({ apiKey: "" });
    await expect(connector.connect()).rejects.toThrow(/API key required/);
  });

  test("getInfo returns correct type", () => {
    const connector = new OpenAIConnector();
    const info = connector.getInfo();
    expect(info.name).toBe("openai");
    expect(info.type).toBe("OpenAIConnector");
  });
});

describe("AnthropicConnector", () => {
  test("constructor sets config", () => {
    const connector = new AnthropicConnector({
      model: "claude-3-opus",
      apiKey: "test-key",
    });
    expect(connector.config.model).toBe("claude-3-opus");
    expect(connector.config.apiKey).toBe("test-key");
  });

  test("connect throws without API key", async () => {
    const connector = new AnthropicConnector({ apiKey: "" });
    await expect(connector.connect()).rejects.toThrow(/API key required/);
  });

  test("defaults to claude-3-5-sonnet model", () => {
    const connector = new AnthropicConnector({ apiKey: "" });
    expect(connector.config.model).toBe("claude-3-5-sonnet-20241022");
  });

  test("getInfo returns correct type", () => {
    const connector = new AnthropicConnector();
    const info = connector.getInfo();
    expect(info.name).toBe("anthropic");
    expect(info.type).toBe("AnthropicConnector");
  });
});

describe("CohereConnector", () => {
  test("constructor sets config", () => {
    const connector = new CohereConnector({ apiKey: "test-key" });
    expect(connector.config.apiKey).toBe("test-key");
    expect(connector.config.embeddingModel).toBe("embed-english-v3.0");
  });

  test("connect throws without API key", async () => {
    const connector = new CohereConnector({ apiKey: "" });
    await expect(connector.connect()).rejects.toThrow(/API key required/);
  });

  test("defaults baseURL to cohere API", () => {
    const connector = new CohereConnector({ apiKey: "" });
    expect(connector.config.baseURL).toBe("https://api.cohere.ai/v1");
  });

  test("getInfo returns correct type", () => {
    const connector = new CohereConnector();
    const info = connector.getInfo();
    expect(info.name).toBe("cohere");
    expect(info.type).toBe("CohereConnector");
  });
});

describe("OllamaConnector", () => {
  test("constructor sets config with defaults", () => {
    const connector = new OllamaConnector();
    expect(connector.config.baseURL).toBe("http://localhost:11434");
    expect(connector.config.model).toBe("llama3");
    expect(connector.config.embeddingModel).toBe("nomic-embed-text");
  });

  test("constructor accepts custom baseURL", () => {
    const connector = new OllamaConnector({ baseURL: "http://myserver:11434" });
    expect(connector.config.baseURL).toBe("http://myserver:11434");
  });

  test("getInfo returns correct type", () => {
    const connector = new OllamaConnector();
    const info = connector.getInfo();
    expect(info.name).toBe("ollama");
    expect(info.type).toBe("OllamaConnector");
  });

  test("defaults timeout to 60000ms", () => {
    const connector = new OllamaConnector();
    expect(connector.config.timeout).toBe(60000);
  });
});
