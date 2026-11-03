// Runs groundingMiddleware against AI SDK 7 (installed as the `ai-v7`
// alias), which is ESM-only and needs Node 22. Started by
// ai-sdk-middleware.test.js in a child process; prints a JSON report and
// exits non-zero on failure.
import { createRequire } from "node:module";
import * as ai from "ai-v7";
import { MockLanguageModelV4 } from "ai-v7/test";

const require = createRequire(import.meta.url);
const {
  groundingMiddleware,
} = require("../../../src/adapters/ai-sdk-middleware.js");

const usage = {
  inputTokens: { total: 3, noCache: 3 },
  outputTokens: { total: 2, text: 2 },
};
const finishReason = { unified: "stop", raw: "stop" };
const ANSWER =
  "Full-time employees receive twenty days of paid vacation per year.";
const calls = [];
const model = new MockLanguageModelV4({
  doGenerate: async (options) => {
    calls.push(options);
    return {
      content: [{ type: "text", text: ANSWER }],
      finishReason,
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
          {
            type: "text-delta",
            id: "t",
            delta: "Full-time employees receive ",
          },
          {
            type: "text-delta",
            id: "t",
            delta: "twenty days of paid vacation per year.",
          },
          { type: "text-end", id: "t" },
          { type: "finish", finishReason, usage },
        ],
      }),
    };
  },
});

const docs = [
  { id: "vacation", content: ANSWER, metadata: { source: "vacation.md" } },
];
const wrapped = ai.wrapLanguageModel({
  model,
  middleware: groundingMiddleware({
    retriever: { retrieve: async () => docs },
    specificationVersion: "v4",
  }),
});

const generated = await ai.generateText({
  model: wrapped,
  prompt: "How many vacation days do I get?",
});
const streamed = ai.streamText({
  model: wrapped,
  prompt: "How many vacation days do I get?",
});
let streamedText = "";
for await (const delta of streamed.textStream) streamedText += delta;

const userText = calls[0].prompt
  .filter((m) => m.role === "user")
  .flatMap((m) => m.content)
  .map((p) => p.text)
  .join("\n");

const report = {
  version: (await import("ai-v7/package.json", { with: { type: "json" } }))
    .default.version,
  contextReachesModel: userText.includes("<reference_documents>"),
  generatedGrounded: generated.providerMetadata?.ragPipeline?.grounded,
  generatedSources: generated.sources.map((s) => s.id),
  streamedText,
  streamedGrounded: (await streamed.providerMetadata)?.ragPipeline?.grounded,
  streamedSources: (await streamed.sources).map((s) => s.id),
};
console.log(JSON.stringify(report));
const ok =
  report.contextReachesModel &&
  report.generatedGrounded === true &&
  report.generatedSources.join() === "vacation" &&
  report.streamedText === ANSWER &&
  report.streamedGrounded === true &&
  report.streamedSources.join() === "vacation";
process.exit(ok ? 0 : 1);
