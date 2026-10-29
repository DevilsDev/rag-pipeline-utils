"use strict";

/**
 * OpenAIConnector `baseURL`: OpenAI-compatible endpoints, and never sending
 * OPENAI_API_KEY to a third-party server.
 */

jest.mock("openai", () => ({ OpenAI: jest.fn() }));

// jest.setup.js resets the module registry after every test, so the SDK
// mock and the connector are required fresh for each one.
let OpenAI;
let OpenAIConnector;

const completion = { choices: [{ message: { content: "ok" } }] };

let savedKey;
beforeEach(() => {
  savedKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-real-openai-key";
  ({ OpenAI } = require("openai"));
  ({ OpenAIConnector } = require("../../../src/connectors/openai-connector"));
  OpenAI.mockReset();
  OpenAI.mockImplementation(() => ({
    chat: { completions: { create: jest.fn().mockResolvedValue(completion) } },
    embeddings: {
      create: jest
        .fn()
        .mockResolvedValue({ data: [{ embedding: [0.1, 0.2] }] }),
    },
  }));
});
afterEach(() => {
  if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = savedKey;
});

describe("OpenAIConnector baseURL", () => {
  test("without baseURL it uses OPENAI_API_KEY and the default endpoint", async () => {
    const connector = new OpenAIConnector();
    await connector.generate("hi");
    const options = OpenAI.mock.calls[0][0];
    expect(options.apiKey).toBe("sk-real-openai-key");
    expect(options).not.toHaveProperty("baseURL");
  });

  test("passes baseURL and an explicit key to the SDK", async () => {
    const connector = new OpenAIConnector({
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: "gsk-groq-key",
      model: "llama-3.1-8b-instant",
    });
    await expect(connector.generate("hi")).resolves.toBe("ok");
    expect(OpenAI.mock.calls[0][0]).toMatchObject({
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: "gsk-groq-key",
      maxRetries: 0,
    });
  });

  test("never sends OPENAI_API_KEY to a custom endpoint", async () => {
    const connector = new OpenAIConnector({
      baseURL: "https://other-provider.example/v1",
    });
    await connector.generate("hi");
    const { apiKey } = OpenAI.mock.calls[0][0];
    expect(apiKey).not.toBe("sk-real-openai-key");
    expect(connector.config.apiKey).toBe("");
  });

  test("works without a key for local OpenAI-compatible servers", async () => {
    delete process.env.OPENAI_API_KEY;
    const connector = new OpenAIConnector({
      baseURL: "http://localhost:1234/v1",
    });
    await expect(connector.connect()).resolves.toBeUndefined();
    await expect(connector.embed("text")).resolves.toEqual([0.1, 0.2]);
  });

  test("the OpenAI API itself still requires a key", async () => {
    delete process.env.OPENAI_API_KEY;
    const connector = new OpenAIConnector();
    await expect(connector.generate("hi")).rejects.toMatchObject({
      code: "MISSING_API_KEY",
    });
    expect(OpenAI).not.toHaveBeenCalled();
  });
});
