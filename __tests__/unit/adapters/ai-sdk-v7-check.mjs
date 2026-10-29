// Runs createAiSdkAdapter against AI SDK 7 (installed as the `ai-v7` alias),
// which is ESM-only and needs Node 22. Started by ai-sdk.test.js in a child
// process; prints a JSON report and exits non-zero on failure.
import { createRequire } from "node:module";
import * as ai from "ai-v7";
import { MockLanguageModelV4, MockEmbeddingModelV4 } from "ai-v7/test";

const require = createRequire(import.meta.url);
const { createAiSdkAdapter } = require("../../../src/adapters/ai-sdk.js");
const { RAG_SYSTEM_PROMPT } = require("../../../src/connectors/rag-prompt.js");

const usage = {
  inputTokens: { total: 3, noCache: 3 },
  outputTokens: { total: 2, text: 2 },
};
const calls = [];
const languageModel = new MockLanguageModelV4({
  doGenerate: async (options) => {
    calls.push(options);
    return {
      content: [{ type: "text", text: "Twenty days." }],
      finishReason: { unified: "stop", raw: "stop" },
      usage,
      warnings: [],
    };
  },
  doStream: async (options) => {
    calls.push(options);
    return {
      stream: ai.simulateReadableStream({
        chunks: [
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: "Twenty " },
          { type: "text-delta", id: "t", delta: "days." },
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
const embeddingModel = new MockEmbeddingModelV4({
  maxEmbeddingsPerCall: 100,
  doEmbed: async ({ values }) => ({
    embeddings: values.map((v) => [v.length, 1]),
    warnings: [],
  }),
});

const { embedder, llm } = createAiSdkAdapter({
  ai,
  embeddingModel,
  languageModel,
});
const docs = [{ id: "v", content: "Twenty days of paid vacation per year." }];

const answer = await llm.generate("How many vacation days?", docs);
const system = calls[0].prompt.find((m) => m.role === "system");
let streamed = "";
for await (const chunk of llm.generateStream("q", docs))
  streamed += chunk.token;

const report = {
  version: (await import("ai-v7/package.json", { with: { type: "json" } }))
    .default.version,
  answer,
  systemPromptReachesModel: system?.content === RAG_SYSTEM_PROMPT,
  streamed,
  embed: await embedder.embed("abc"),
  embedBatch: await embedder.embedBatch(["a", "bb"]),
};
console.log(JSON.stringify(report));
const ok =
  report.answer === "Twenty days." &&
  report.systemPromptReachesModel &&
  report.streamed === "Twenty days." &&
  JSON.stringify(report.embed) === "[3,1]" &&
  JSON.stringify(report.embedBatch) === "[[1,1],[2,1]]";
process.exit(ok ? 0 : 1);
