/**
 * Basic RAG pipeline example (fully offline, no API keys).
 *
 * Shows:
 *   1. Indexing documents with the built-in LocalEmbedder (TF-IDF) and
 *      MemoryRetriever (in-memory cosine similarity)
 *   2. A custom LLM plugin registered on `pluginRegistry` and referenced by
 *      name in createRagPipeline()
 *   3. pipeline.run() with citations and evaluation
 *   4. A retrieval-only pipeline (no llm): `answer` is null
 *   5. Cancellation with an AbortSignal via `options.signal`
 */

const {
  createRagPipeline,
  LocalEmbedder,
  MemoryRetriever,
  pluginRegistry,
} = require("@devilsdev/rag-pipeline-utils");

const documents = [
  {
    id: "rag-overview",
    content:
      "Retrieval-augmented generation retrieves relevant documents and passes them to a language model as context. " +
      "This grounds the answer in your own data.",
    metadata: { source: "rag-overview.md" },
  },
  {
    id: "vector-db",
    content:
      "A vector database stores embeddings and finds the nearest vectors to a query embedding. " +
      "Cosine similarity is a common distance measure.",
    metadata: { source: "vector-db.md" },
  },
  {
    id: "chunking",
    content:
      "Chunking splits long documents into smaller passages before embedding. " +
      "Smaller chunks make retrieval more precise.",
    metadata: { source: "chunking.md" },
  },
  {
    id: "reranking",
    content:
      "A reranker reorders retrieved documents by relevance before generation. " +
      "It trades a little latency for better context.",
    metadata: { source: "reranking.md" },
  },
];

/**
 * Custom LLM plugin. The pipeline calls `generate(query, docs, options)` and
 * expects a string; `options.signal` is the run's AbortSignal. This stub is
 * extractive (it returns the first sentence of the best document) so the
 * example runs offline. Swap in OpenAIConnector, AnthropicConnector or
 * OllamaConnector for real generation.
 *
 * Plugins registered on `pluginRegistry` must carry
 * `metadata: { name, version, type }` and the stage's required method.
 */
class ExtractiveLLM {
  constructor() {
    this.metadata = { name: "extractive-llm", version: "1.0.0", type: "llm" };
  }

  async generate(query, docs = [], options = {}) {
    if (options.signal?.aborted) throw options.signal.reason;
    if (docs.length === 0) return "No relevant documents were found.";
    const best = docs[0].content || "";
    const firstSentence = best.split(/(?<=\.)\s+/)[0];
    return firstSentence;
  }
}

async function main() {
  console.log("\n=== Basic RAG pipeline (offline) ===\n");

  // 1. Index documents. LocalEmbedder must be trained on the corpus first;
  //    its vector size is the vocabulary size, so embed queries with the same
  //    trained instance.
  const embedder = new LocalEmbedder();
  embedder.train(documents.map((d) => d.content));

  const retriever = new MemoryRetriever();
  await retriever.store(
    documents.map((d) => ({
      id: d.id,
      vector: embedder.embed(d.content),
      content: d.content,
      metadata: d.metadata,
    })),
  );
  console.log(
    `Indexed ${retriever.getStats().documentCount} documents ` +
      `(${retriever.getStats().dimensions} dimensions)\n`,
  );

  // 2. Register the custom LLM and reference it by name.
  await pluginRegistry.register("llm", "extractive", new ExtractiveLLM());

  // 3. Full pipeline: embed query -> retrieve -> generate -> citations/eval.
  const pipeline = createRagPipeline({
    embedder,
    retriever,
    llm: "extractive",
  });

  const query = "How does a vector database find similar documents?";
  const result = await pipeline.run({
    query,
    options: { topK: 2, citations: true, evaluate: true },
  });

  if (!result.success) {
    throw new Error(`Pipeline failed: ${result.error}`);
  }

  console.log("Query:   ", result.query);
  console.log("Answer:  ", result.answer);
  console.log(
    "Results: ",
    result.results.map((r) => `${r.id} (${r.score.toFixed(3)})`).join(", "),
  );
  console.log(
    "Groundedness (citations):",
    result.citations.groundednessScore.toFixed(2),
  );
  console.log("Evaluation scores:", formatScores(result.evaluation.scores));

  // 4. Retrieval only: without an llm, answer is null and evaluation covers
  //    the retrieval metrics only.
  const retrievalOnly = createRagPipeline({ embedder, retriever });
  const retrieved = await retrievalOnly.run({
    query: "Why split documents into chunks?",
    options: { topK: 1, evaluate: true },
  });
  console.log("\n--- Retrieval only (no llm) ---");
  console.log("Answer:  ", retrieved.answer);
  console.log("Top hit: ", retrieved.results[0]?.id);

  // 5. Cancellation: abort the run through options.signal.
  const controller = new AbortController();
  controller.abort();
  const cancelled = await pipeline.run({
    query,
    options: { signal: controller.signal },
  });
  console.log("\n--- Cancelled run ---");
  console.log("success:", cancelled.success, "| error:", cancelled.error);

  console.log("\nDone.\n");
}

function formatScores(scores = {}) {
  return Object.entries(scores)
    .map(([name, value]) => `${name}=${value.toFixed(2)}`)
    .join(" ");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
