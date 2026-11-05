"use strict";

/**
 * AnthropicConnector with current Claude models (found by the Claude
 * benchmarks and confirmed live on 2026-11-05):
 * - Claude 4.7 and later reject any temperature but the default with 400;
 *   the LLM judge passes temperature 0.
 * - Models that think reply [thinking, text]; the answer is not content[0].
 * - A refusal has no text.
 */

const {
  AnthropicConnector,
  responseText,
} = require("../../../src/connectors/anthropic-connector");
const { checkAnswer } = require("../../../src/grounding/check-answer");
const {
  fromAnthropicCitations,
  verifyCitations,
} = require("../../../src/grounding/provider-citations");

const reply = (content, extra = {}) => ({
  data: {
    content,
    stop_reason: "end_turn",
    usage: { input_tokens: 120, output_tokens: 30 },
    ...extra,
  },
});
const temperature400 = () =>
  Object.assign(new Error("Request failed with status code 400"), {
    response: {
      status: 400,
      data: {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "`temperature` is deprecated for this model.",
        },
      },
    },
  });

let model = 0;
const connector = () =>
  new AnthropicConnector({
    apiKey: "test-key",
    // A new model name per test: the learned "no temperature" set is shared
    model: `claude-test-${(model += 1)}`,
    maxRetries: 0,
    retryDelay: 1,
  });

describe("responseText", () => {
  test("joins the text blocks and skips thinking", () => {
    expect(
      responseText({
        content: [
          { type: "thinking", thinking: "Let me check 391 = 17 x 23." },
          { type: "text", text: "No. " },
          { type: "text", text: "391 is 17 times 23." },
        ],
      }),
    ).toBe("No. 391 is 17 times 23.");
  });

  test.each([
    [{ content: [], stop_reason: "refusal" }, "MODEL_REFUSED", /declined/],
    [
      {
        content: [{ type: "thinking", thinking: "..." }],
        stop_reason: "max_tokens",
      },
      "NO_TEXT",
      /raise maxTokens/,
    ],
    [{ content: [] }, "NO_TEXT", /no text/],
  ])("throws a clear error for %j", (data, code, message) => {
    let error;
    try {
      responseText(data);
    } catch (e) {
      error = e;
    }
    expect(error.code).toBe(code);
    expect(error.message).toMatch(message);
  });
});

describe("AnthropicConnector.generate with current models", () => {
  test("returns the answer when the model thinks first", async () => {
    const c = connector();
    c.client.post = jest.fn().mockResolvedValue(
      reply([
        { type: "thinking", thinking: "Hmm." },
        { type: "text", text: "Twenty days." },
      ]),
    );
    await expect(c.generate("How many days?")).resolves.toBe("Twenty days.");
  });

  test("a refusal rejects with MODEL_REFUSED instead of a TypeError", async () => {
    const c = connector();
    c.client.post = jest
      .fn()
      .mockResolvedValue(reply([], { stop_reason: "refusal" }));
    await expect(c.generate("q")).rejects.toMatchObject({
      code: "MODEL_REFUSED",
    });
  });

  test("retries without temperature when the model rejects it, warns once, and remembers", async () => {
    const warn = jest
      .spyOn(process, "emitWarning")
      .mockImplementation(() => {});
    const c = connector();
    c.client.post = jest
      .fn()
      .mockRejectedValueOnce(temperature400())
      .mockResolvedValue(reply([{ type: "text", text: "ok" }]));

    await expect(c.generate("q", [], { temperature: 0 })).resolves.toBe("ok");
    const [first, second] = c.client.post.mock.calls.map((call) => call[1]);
    expect(first.temperature).toBe(0);
    expect(second).not.toHaveProperty("temperature");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toEqual({
      code: "RAG_ANTHROPIC_TEMPERATURE",
    });

    // Later calls to the same model leave temperature out at once
    await c.generate("q", [], { temperature: 0 });
    expect(c.client.post.mock.calls[2][1]).not.toHaveProperty("temperature");
    expect(c.client.post).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  test("other 400s are not retried", async () => {
    const c = connector();
    const bad = Object.assign(new Error("400"), {
      response: {
        status: 400,
        data: { error: { message: "max_tokens: must be at most 64000" } },
      },
    });
    c.client.post = jest.fn().mockRejectedValue(bad);
    await expect(c.generate("q", [], { temperature: 0 })).rejects.toBe(bad);
    expect(c.client.post).toHaveBeenCalledTimes(1);
  });

  test("a request without temperature is never retried for it", async () => {
    const c = connector();
    c.client.post = jest.fn().mockRejectedValue(temperature400());
    await expect(c.generate("q")).rejects.toThrow("400");
    expect(c.client.post).toHaveBeenCalledTimes(1);
  });

  test("generateWithUsage resolves the text with token usage", async () => {
    const c = connector();
    c.client.post = jest.fn().mockResolvedValue(
      reply([{ type: "text", text: "ok" }], {
        usage: {
          input_tokens: 100,
          cache_read_input_tokens: 20,
          output_tokens: 7,
        },
      }),
    );
    await expect(c.generateWithUsage("q")).resolves.toEqual({
      text: "ok",
      usage: { inputTokens: 120, outputTokens: 7, totalTokens: 127 },
    });
  });

  test("generateStream retries without temperature too", async () => {
    jest.spyOn(process, "emitWarning").mockImplementation(() => {});
    const c = connector();
    const { Readable } = require("stream");
    const sse = [
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n',
      'data: {"type":"message_stop"}\n',
    ];
    c.client.post = jest
      .fn()
      .mockRejectedValueOnce(temperature400())
      .mockResolvedValue({ data: Readable.from(sse) });
    const tokens = [];
    for await (const chunk of c.generateStream("q", [], { temperature: 0 })) {
      tokens.push(chunk.token);
    }
    expect(tokens.join("")).toBe("Hi");
    expect(c.client.post.mock.calls[1][1]).not.toHaveProperty("temperature");
    process.emitWarning.mockRestore();
  });
});

describe("the judge with AnthropicConnector", () => {
  test("works on a model that rejects temperature, and reports usage", async () => {
    jest.spyOn(process, "emitWarning").mockImplementation(() => {});
    const judge = connector();
    judge.client.post = jest
      .fn()
      .mockRejectedValueOnce(temperature400())
      .mockResolvedValue(
        reply([
          { type: "thinking", thinking: "Five weeks each year is the same." },
          {
            type: "text",
            text: JSON.stringify([
              {
                claim: 1,
                verdict: "supported",
                source: "leave",
                reason: "same",
              },
            ]),
          },
        ]),
      );
    const check = await checkAnswer({
      answer: "Staff get five weeks off annually.",
      sources: [
        {
          id: "leave",
          content: "Each worker may take five weeks of paid leave every year.",
        },
      ],
      judge,
      evaluate: false,
    });
    expect(check.grounded).toBe(true);
    expect(check.judge.error).toBeUndefined();
    expect(check.judge.usage).toEqual({
      inputTokens: 120,
      outputTokens: 30,
      totalTokens: 150,
    });
    process.emitWarning.mockRestore();
  });
});

describe("refusals in provider citations", () => {
  test("a refused Claude message is reported and never verified", async () => {
    const normalized = fromAnthropicCitations({
      content: [],
      stop_reason: "refusal",
    });
    expect(normalized.stopReason).toBe("refusal");
    const check = await verifyCitations(normalized);
    expect(check).toMatchObject({ refused: true, verified: false });
  });

  test("a normal message is not a refusal", async () => {
    const check = await verifyCitations(
      fromAnthropicCitations({ content: [], stop_reason: "end_turn" }),
    );
    expect(check.refused).toBe(false);
  });
});
