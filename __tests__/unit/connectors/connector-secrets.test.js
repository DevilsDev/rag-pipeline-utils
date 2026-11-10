"use strict";

const util = require("util");
const { CohereConnector } = require("../../../src/connectors/cohere-connector");
const {
  AnthropicConnector,
} = require("../../../src/connectors/anthropic-connector");
const { OpenAIConnector } = require("../../../src/connectors/openai-connector");

const KEY = "sk-test-SECRET-1234567890";

describe.each([
  ["Cohere", () => new CohereConnector({ apiKey: KEY })],
  ["Anthropic", () => new AnthropicConnector({ apiKey: KEY })],
  ["OpenAI", () => new OpenAIConnector({ apiKey: KEY })],
])("%s connector does not expose its API key", (_name, make) => {
  test("console.log / util.inspect output has no key", () => {
    const c = make();
    expect(util.inspect(c, { depth: 10, showHidden: true })).not.toContain(KEY);
    expect(util.format("%o", c)).not.toContain(KEY);
  });

  test("JSON.stringify and enumeration have no key", () => {
    const c = make();
    expect(JSON.stringify(c)).not.toContain(KEY);
    expect(JSON.stringify({ ...c.config })).not.toContain(KEY);
    expect(JSON.stringify({ ...c.options })).not.toContain(KEY);
    expect(Object.keys(c.config)).not.toContain("apiKey");
  });

  test("the connector can still read its key", () => {
    const c = make();
    expect(c.config.apiKey).toBe(KEY);
  });
});
