// AI SDK 7 (installed as `ai-v7`, ESM only) with a real Claude model, run
// by anthropic-features.live.test.js in a child process with
// ANTHROPIC_API_KEY set. Prints one JSON line of results.
import { createRequire } from "node:module";
import * as ai from "ai-v7";
import { createAnthropic } from "@ai-sdk/anthropic-v4";

const require = createRequire(import.meta.url);
const { createRagPipeline } = require("../../src/core/create-pipeline.js");
const { MemoryRetriever } = require("../../src/connectors/memory-retriever.js");
const { BM25Search } = require("../../src/retrieval/bm25-search.js");
const { HashEmbedder } = require("../../src/testing.js");
const { createAiSdkAdapter } = require("../../src/adapters/ai-sdk.js");
const {
  groundingMiddleware,
} = require("../../src/adapters/ai-sdk-middleware.js");
const {
  AnthropicConnector,
} = require("../../src/connectors/anthropic-connector.js");

const MODEL = process.env.LIVE_ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const apiKey = process.env.ANTHROPIC_API_KEY;
const model = createAnthropic({ apiKey })(MODEL);
const DOCS = JSON.parse(process.env.LIVE_DOCS);

const search = new BM25Search();
search.index(DOCS);
const bm25 = {
  retrieve: ({ query, topK = 3 }) => search.search(query, { k: topK }),
};

const out = { version: require("ai-v7/package.json").version };

// createAiSdkAdapter
{
  const embedder = new HashEmbedder();
  const retriever = new MemoryRetriever();
  await retriever.store(
    await Promise.all(
      DOCS.map(async (d) => ({
        ...d,
        vector: await embedder.embed(d.content),
      })),
    ),
  );
  const { llm } = createAiSdkAdapter({
    ai,
    languageModel: model,
    settings: { maxOutputTokens: 200 },
  });
  const result = await createRagPipeline({ embedder, retriever, llm }).run({
    query: "How many remote days are allowed per week?",
    options: { citations: true },
  });
  out.adapter = { success: result.success, answer: result.answer };
}

// groundingMiddleware + generateText
{
  const result = await ai.generateText({
    model: ai.wrapLanguageModel({
      model,
      middleware: groundingMiddleware({ retriever: bm25, topK: 1 }),
    }),
    prompt: "How many vacation days do full-time employees get?",
    maxOutputTokens: 200,
  });
  const report = result.providerMetadata.ragPipeline;
  out.generate = {
    text: result.text,
    sourceId: report.sources[0] && report.sources[0].id,
    groundedness: report.groundedness,
    sdkSourceId: result.sources[0] && result.sources[0].id,
  };
}

// groundingMiddleware + streamText, with Claude as the judge
{
  const result = ai.streamText({
    model: ai.wrapLanguageModel({
      model,
      middleware: groundingMiddleware({
        retriever: bm25,
        topK: 1,
        judge: new AnthropicConnector({ apiKey, model: MODEL, maxTokens: 300 }),
      }),
    }),
    prompt: "Where do visitors park?",
    maxOutputTokens: 200,
  });
  let text = "";
  for await (const part of result.textStream) text += part;
  const metadata = await result.providerMetadata;
  out.stream = {
    text,
    sourceId:
      metadata.ragPipeline.sources[0] && metadata.ragPipeline.sources[0].id,
    judge: Boolean(metadata.ragPipeline.judge),
  };
}

console.log(JSON.stringify(out));
