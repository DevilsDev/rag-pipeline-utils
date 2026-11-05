// Journey A (ESM): the first pipeline a developer builds.
//
// Source: README.md "Build a pipeline" (LocalEmbedder + MemoryRetriever),
// then .github/README.md "Quick start with an LLM" for the llm and the
// citations/evaluate options. Neither README shows AnthropicConnector, and
// Anthropic has no embeddings API, so the developer keeps the offline
// LocalEmbedder from the first example and adds AnthropicConnector as the
// llm (the connector reads ANTHROPIC_API_KEY, per the Connectors table).
import {
  createRagPipeline,
  LocalEmbedder,
  MemoryRetriever,
  AnthropicConnector,
} from "@devilsdev/rag-pipeline-utils";

const docs = [
  {
    id: "vacation",
    content:
      "Full-time employees receive twenty days of paid vacation per year.",
  },
  {
    id: "remote",
    content: "Remote work is allowed two days per week with manager approval.",
  },
];

const embedder = new LocalEmbedder();
embedder.train(docs.map((doc) => doc.content));
const retriever = new MemoryRetriever();
await retriever.store(
  docs.map((doc) => ({ ...doc, vector: embedder.embed(doc.content) })),
);

// Changed from the README: AnthropicConnector instead of OpenAIConnector.
// Default model (the connector's claude-sonnet-5-5), as a developer gets it.
const claude = new AnthropicConnector({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const pipeline = createRagPipeline({ embedder, retriever, llm: claude });
const result = await pipeline.run({
  query: "How many vacation days do I get?",
  options: { citations: true, evaluate: true },
});

console.log(result.answer);
console.log(result.citations?.groundednessScore); // 0..1, share of grounded sentences
console.log(result.evaluation?.scores); // { faithfulness, relevance, contextPrecision, groundedness }

console.log(
  "RESULT " +
    JSON.stringify({
      success: result.success,
      error: result.error ?? null,
      topId: result.results?.[0]?.id ?? null,
      answer: result.answer,
      groundedness: result.citations?.groundednessScore ?? null,
      scores: result.evaluation?.scores ?? null,
    }),
);
