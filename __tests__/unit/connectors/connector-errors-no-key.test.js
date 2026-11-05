"use strict";

/**
 * Errors from the axios-based connectors must not carry the API key.
 * axios errors keep the request config, headers included, so a developer's
 * console.error(err) or a logger serializing the error printed the key
 * (found by the consumer journeys). They also said only "Request failed
 * with status code 401"; the API's explanation is now in the message.
 */

const http = require("http");
const { inspect } = require("util");

const {
  AnthropicConnector,
} = require("../../../src/connectors/anthropic-connector");
const { CohereConnector } = require("../../../src/connectors/cohere-connector");
const { OllamaConnector } = require("../../../src/connectors/ollama-connector");
const { checkAnswer } = require("../../../src/grounding/check-answer");

const KEY = "sk-ant-api03-TEST-ONLY-not-a-real-key";

let server;
let base;
let reply;

beforeAll(async () => {
  globalThis.__ALLOW_LOOPBACK_HTTP__ = true;
  server = http.createServer((req, res) => reply(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  delete globalThis.__ALLOW_LOOPBACK_HTTP__;
});

const json =
  (status, body, headers = {}) =>
  (req, res) => {
    req.resume();
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  };

const authError = json(401, {
  type: "error",
  error: { type: "authentication_error", message: "invalid x-api-key" },
});

function expectNoKey(error) {
  expect(inspect(error, { depth: 10 })).not.toContain(KEY);
  expect(JSON.stringify(error)).not.toContain(KEY);
  expect(String(error.stack)).not.toContain(KEY);
}

async function caught(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

const anthropic = (options = {}) =>
  new AnthropicConnector({
    apiKey: KEY,
    baseURL: base,
    maxRetries: 0,
    retryDelay: 1,
    ...options,
  });

describe("connector errors", () => {
  test("a 401 says why and carries no key", async () => {
    reply = authError;
    const error = await caught(anthropic().generate("hi"));
    expect(error.message).toBe(
      "Anthropic API error 401: authentication_error: invalid x-api-key",
    );
    expect(error.status).toBe(401);
    expect(error.response.data.error.type).toBe("authentication_error");
    expect(error).not.toHaveProperty("config");
    expect(error).not.toHaveProperty("request");
    expectNoKey(error);
  });

  test("a streamed request's error is read and carries no key", async () => {
    reply = authError;
    const error = await caught(
      (async () => {
        for await (const chunk of anthropic().generateStream("hi")) void chunk;
      })(),
    );
    expect(error.message).toMatch(/401: authentication_error/);
    expectNoKey(error);
  });

  test("a 404 for an unknown model says so", async () => {
    reply = json(404, {
      type: "error",
      error: { type: "not_found_error", message: "model: claude-nope" },
    });
    const error = await caught(
      anthropic({ model: "claude-nope" }).generate("hi"),
    );
    expect(error.message).toBe(
      "Anthropic API error 404: not_found_error: model: claude-nope",
    );
    expectNoKey(error);
  });

  test("a network error carries no key", async () => {
    const error = await caught(
      anthropic({ baseURL: "http://127.0.0.1:1" }).generate("hi"),
    );
    expect(error.message).toMatch(/^Anthropic request failed: /);
    expect(error.code).toBe("ECONNREFUSED");
    expectNoKey(error);
  });

  test("the judge's error carries no key either", async () => {
    reply = authError;
    const error = await caught(
      checkAnswer({
        answer: "Some claim.",
        sources: ["a"],
        judge: anthropic(),
      }),
    );
    expectNoKey(error);
  });

  test("Retry-After on a 429 is still honoured", async () => {
    let calls = 0;
    reply = (req, res) => {
      calls += 1;
      if (calls === 1) {
        json(
          429,
          { error: { type: "rate_limit_error", message: "slow down" } },
          {
            "retry-after": "0",
          },
        )(req, res);
      } else {
        json(200, {
          content: [{ type: "text", text: "ok" }],
          stop_reason: "end_turn",
        })(req, res);
      }
    };
    await expect(anthropic({ maxRetries: 2 }).generate("hi")).resolves.toBe(
      "ok",
    );
    expect(calls).toBe(2);
  });

  test("an abort is still an AbortError", async () => {
    reply = () => {}; // never answers
    const controller = new AbortController();
    const pending = anthropic().generate("hi", [], {
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 20);
    const error = await caught(pending);
    expect(error.name).toBe("AbortError");
    expectNoKey(error);
  });

  test("Cohere and Ollama errors are clean too", async () => {
    reply = json(401, { message: "invalid api token" });
    const cohere = await caught(
      new CohereConnector({ apiKey: KEY, baseURL: base, maxRetries: 0 }).embed(
        "hi",
      ),
    );
    expect(cohere.message).toBe("Cohere API error 401: invalid api token");
    expectNoKey(cohere);

    reply = json(500, { error: "model failed to load" });
    const ollama = await caught(
      new OllamaConnector({ baseURL: base, maxRetries: 0 }).generate("hi"),
    );
    expect(ollama.message).toBe("Ollama API error 500: model failed to load");
  });
});
