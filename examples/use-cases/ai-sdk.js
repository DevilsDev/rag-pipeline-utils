// README use case: "Ground an AI SDK app".
// Runs offline: BM25 over two documents as the retriever, and the AI SDK's
// MockLanguageModelV3 in place of openai("gpt-4o-mini"), answering with a
// sentence the documents contradict. Edit it, then run `npm run ai-sdk` in
// the terminal.

import { generateText, wrapLanguageModel } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { BM25Search, groundingMiddleware } from "@devilsdev/rag-pipeline-utils";

const search = new BM25Search();
search.index([
  {
    id: "vacation",
    content:
      "Full-time employees receive twenty days of paid vacation per year.",
    metadata: { source: "handbook/vacation.md" },
  },
  {
    id: "remote",
    content: "Remote work is allowed two days per week with manager approval.",
    metadata: { source: "handbook/remote.md" },
  },
]);
const retriever = {
  retrieve: async ({ query, topK }) => search.search(query, { k: topK }),
};

// Replace with openai("gpt-4o-mini") from "@ai-sdk/openai" and an API key.
const answer = "Full-time employees never receive paid vacation.";
const mockModel = new MockLanguageModelV3({
  doGenerate: async () => ({
    content: [{ type: "text", text: answer }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: { total: 1, noCache: 1 },
      outputTokens: { total: 1, text: 1 },
    },
    warnings: [],
  }),
});

const model = wrapLanguageModel({
  model: mockModel,
  middleware: groundingMiddleware({ retriever, topK: 1 }),
});

const { text, sources, providerMetadata } = await generateText({
  model,
  prompt: "How many vacation days do I get?",
});
console.log(text);
console.log(sources.map((s) => s.id)); // ["vacation"]
console.log(providerMetadata.ragPipeline.grounded); // false: the answer negates its source
console.log(providerMetadata.ragPipeline.unsupported); // ["Full-time employees never receive paid vacation."]
