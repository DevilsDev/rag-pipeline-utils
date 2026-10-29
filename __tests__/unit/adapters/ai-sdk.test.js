"use strict";

/**
 * createAiSdkAdapter against the real AI SDK (v6, a dev dependency) with its
 * mock models: no network, but real generateText / streamText / embed code.
 */

const ai = require("ai");
const { MockLanguageModelV3, MockEmbeddingModelV3 } = require("ai/test");
const { createAiSdkAdapter } = require("../../../src/adapters/ai-sdk");
const { RAG_SYSTEM_PROMPT } = require("../../../src/connectors/rag-prompt");
const {
  createRagPipeline,
  MemoryRetriever,
  validatePlugin,
} = require("../../../src/index");

const usage = {
  inputTokens: { total: 3, noCache: 3 },
  outputTokens: { total: 2, text: 2 },
};

/** A mock language model that records each call and answers `text`. */
function languageModel(text = "Full-time employees receive twenty days.") {
  const calls = [];
  const model = new MockLanguageModelV3({
    doGenerate: async (options) => {
      calls.push(options);
      return {
        content: [{ type: "text", text }],
        finishReason: { unified: "stop", raw: "stop" },
        usage,
        warnings: [],
      };
    },
    doStream: async (options) => {
      calls.push(options);
      const words = text.split(/(?<= )/);
      return {
        stream: ai.simulateReadableStream({
          chunks: [
            { type: "text-start", id: "t" },
            ...words.map((delta) => ({ type: "text-delta", id: "t", delta })),
            { type: "text-end", id: "t" },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: "stop" },
              usage,
            },
          ],
        }),
      };
    },
  });
  return { model, calls };
}

/** Bag-of-words embedding model, so retrieval ranks sensibly. */
function embeddingModel() {
  const vector = (text) => {
    const v = new Array(64).fill(0);
    for (const w of String(text)
      .toLowerCase()
      .match(/[a-z]+/g) || []) {
      let h = 0;
      for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      v[h % 64] += 1;
    }
    return v;
  };
  const calls = [];
  const model = new MockEmbeddingModelV3({
    maxEmbeddingsPerCall: 100,
    doEmbed: async ({ values, abortSignal }) => {
      calls.push({ values, abortSignal });
      return { embeddings: values.map(vector), warnings: [] };
    },
  });
  return { model, calls };
}

const docs = [
  {
    id: "vacation",
    content:
      "Full-time employees receive twenty days of paid vacation per year.",
  },
  { id: "remote", content: "Remote work is allowed two days per week." },
];

describe("createAiSdkAdapter", () => {
  beforeAll(() => jest.useRealTimers());

  test("embedder uses embed and embedMany", async () => {
    const emb = embeddingModel();
    const { embedder, llm } = createAiSdkAdapter({
      ai,
      embeddingModel: emb.model,
    });
    expect(llm).toBeNull();

    const one = await embedder.embed("vacation days");
    expect(one).toHaveLength(64);
    expect(await embedder.embedQuery("vacation days")).toEqual(one);

    const many = await embedder.embedBatch(["a b", "c d"]);
    expect(many).toHaveLength(2);
    expect(emb.calls.at(-1).values).toEqual(["a b", "c d"]);
  });

  test("llm sends the RAG system prompt and the retrieved documents", async () => {
    const lm = languageModel("Twenty days.");
    const { llm } = createAiSdkAdapter({ ai, languageModel: lm.model });

    await expect(llm.generate("How many vacation days?", docs)).resolves.toBe(
      "Twenty days.",
    );
    const [call] = lm.calls;
    const system = call.prompt.find((m) => m.role === "system");
    const user = call.prompt.find((m) => m.role === "user");
    expect(system.content).toBe(RAG_SYSTEM_PROMPT);
    const userText = user.content.map((p) => p.text).join("");
    expect(userText).toContain("twenty days of paid vacation");
    expect(userText).toContain("Question: How many vacation days?");
  });

  test("passes the run's AbortSignal and per-call settings", async () => {
    const lm = languageModel();
    const { llm } = createAiSdkAdapter({
      ai,
      languageModel: lm.model,
      settings: { temperature: 0 },
    });
    const controller = new AbortController();
    await llm.generate("q", docs, {
      signal: controller.signal,
      maxOutputTokens: 64,
    });
    expect(lm.calls[0].abortSignal).toBe(controller.signal);
    expect(lm.calls[0].temperature).toBe(0);
    expect(lm.calls[0].maxOutputTokens).toBe(64);
  });

  test("generateStream yields tokens and a final done chunk", async () => {
    const lm = languageModel("Twenty days of vacation.");
    const { llm } = createAiSdkAdapter({ ai, languageModel: lm.model });
    const chunks = [];
    for await (const chunk of llm.generateStream("q", docs)) chunks.push(chunk);
    expect(chunks.at(-1)).toEqual({ token: "", done: true });
    expect(
      chunks
        .filter((c) => !c.done)
        .map((c) => c.token)
        .join(""),
    ).toBe("Twenty days of vacation.");
  });

  test("works end to end in createRagPipeline, with citations", async () => {
    const { embedder, llm } = createAiSdkAdapter({
      ai,
      embeddingModel: embeddingModel().model,
      languageModel: languageModel(
        "Full-time employees receive twenty days of paid vacation per year.",
      ).model,
    });
    const retriever = new MemoryRetriever();
    await retriever.store(
      await Promise.all(
        docs.map(async (d) => ({
          ...d,
          vector: await embedder.embed(d.content),
        })),
      ),
    );
    const pipeline = createRagPipeline({ embedder, retriever, llm });
    const result = await pipeline.run({
      query: "How many vacation days do I get?",
      options: { citations: true },
    });
    expect(result.success).toBe(true);
    expect(result.results[0].id).toBe("vacation");
    expect(result.answer).toMatch(/twenty days/);
    expect(result.citations.groundednessScore).toBe(1);
  });

  test("streams through createRagPipeline", async () => {
    const { embedder, llm } = createAiSdkAdapter({
      ai,
      embeddingModel: embeddingModel().model,
      languageModel: languageModel("Twenty days.").model,
    });
    const retriever = new MemoryRetriever();
    await retriever.store([
      { ...docs[0], vector: await embedder.embed(docs[0].content) },
    ]);
    const stream = await createRagPipeline({ embedder, retriever, llm }).run({
      query: "vacation",
      options: { stream: true },
    });
    let text = "";
    for await (const chunk of stream) text += chunk.token || "";
    expect(text).toBe("Twenty days.");
  });

  test("the adapters pass validatePlugin, including registry rules", () => {
    const { embedder, llm } = createAiSdkAdapter({
      ai,
      embeddingModel: embeddingModel().model,
      languageModel: languageModel().model,
    });
    expect(
      validatePlugin("embedder", embedder, { registry: true }).errors,
    ).toEqual([]);
    expect(validatePlugin("llm", llm, { registry: true }).errors).toEqual([]);
  });

  test("explains missing pieces", () => {
    expect(() => createAiSdkAdapter({})).toThrow(/pass `ai`/);
    expect(() => createAiSdkAdapter({ ai })).toThrow(
      /embeddingModel, a languageModel, or both/,
    );
    expect(() =>
      createAiSdkAdapter({ ai: {}, languageModel: languageModel().model }),
    ).toThrow(/needs ai\.generateText/);
  });
});

// AI SDK 7 is ESM-only and needs Node 22, so it is checked in a child
// process (ai-sdk-v7-check.mjs) and only where Node 22+ runs.
const nodeMajor = Number(process.versions.node.split(".")[0]);
(nodeMajor >= 22 ? describe : describe.skip)("with AI SDK 7", () => {
  test("generates, streams, embeds and sends the RAG system prompt", () => {
    const { spawnSync } = require("child_process");
    const path = require("path");
    const run = spawnSync(
      process.execPath,
      [path.join(__dirname, "ai-sdk-v7-check.mjs")],
      { encoding: "utf8" },
    );
    const report = JSON.parse(run.stdout || "{}");
    expect(run.stderr).toBe("");
    expect(report).toMatchObject({
      answer: "Twenty days.",
      systemPromptReachesModel: true,
      streamed: "Twenty days.",
    });
    expect(run.status).toBe(0);
  });
});
