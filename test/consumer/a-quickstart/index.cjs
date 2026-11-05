// Journey A (CommonJS): the same first pipeline with require().
//
// The README examples use top-level await, which CommonJS doesn't have, so
// the developer wraps them in an async main(). Model chosen explicitly
// (claude-haiku-5-5) to show the `model` option.
const {
  createRagPipeline,
  LocalEmbedder,
  MemoryRetriever,
  AnthropicConnector,
} = require("@devilsdev/rag-pipeline-utils");

async function main() {
  const docs = [
    {
      id: "vacation",
      content:
        "Full-time employees receive twenty days of paid vacation per year.",
    },
    {
      id: "remote",
      content:
        "Remote work is allowed two days per week with manager approval.",
    },
  ];

  const embedder = new LocalEmbedder();
  embedder.train(docs.map((doc) => doc.content));
  const retriever = new MemoryRetriever();
  await retriever.store(
    docs.map((doc) => ({ ...doc, vector: embedder.embed(doc.content) })),
  );

  const claude = new AnthropicConnector({ model: "claude-haiku-5-5" });
  const pipeline = createRagPipeline({ embedder, retriever, llm: claude });
  const result = await pipeline.run({
    query: "Can I work from home?",
    options: { citations: true, evaluate: true },
  });

  console.log(result.answer);
  console.log(result.citations && result.citations.groundednessScore);
  console.log(result.evaluation && result.evaluation.scores);

  console.log(
    "RESULT " +
      JSON.stringify({
        success: result.success,
        error: result.error || null,
        topId: result.results && result.results[0] && result.results[0].id,
        answer: result.answer,
        groundedness: result.citations
          ? result.citations.groundednessScore
          : null,
        scores: result.evaluation ? result.evaluation.scores : null,
      }),
  );
}

main().catch((error) => {
  console.error(error && error.message);
  process.exit(1);
});
