#!/usr/bin/env node
/**
 * RAG pipeline with OpenAI (embeddings + chat) and Pinecone (vector store).
 *
 * - OpenAIConnector from the library is both the embedder and the llm.
 * - PineconeRetriever from the library stores and searches a Pinecone index
 *   (REST API, no client package); it waits for its own writes to be
 *   indexed, so a query right after store() sees them.
 * - createRagPipeline() wires them together; run() returns
 *   { success, query, results, answer, citations, evaluation }.
 *
 * Offline / mock mode (no API keys, no network):
 *   node index.js --mock        (or USE_MOCK_MODE=true)
 * uses LocalEmbedder + MemoryRetriever + an extractive stub llm instead.
 */

require("dotenv").config();
const {
  createRagPipeline,
  LocalEmbedder,
  MemoryRetriever,
  OpenAIConnector,
  PineconeRetriever,
} = require("@devilsdev/rag-pipeline-utils");

const USE_MOCK =
  process.env.USE_MOCK_MODE === "true" || process.argv.includes("--mock");

// =============================================================================
// Mock mode components
// =============================================================================

/** Extractive stub llm: returns the first sentence of the best document. */
const extractiveLLM = {
  async generate(query, docs = [], options = {}) {
    if (options.signal?.aborted) throw options.signal.reason;
    if (docs.length === 0) return "No relevant documents were found.";
    return (docs[0].content || "").split(/(?<=\.)\s+/)[0];
  },
};

// =============================================================================
// Main
// =============================================================================

const documents = [
  {
    id: "doc-1",
    content:
      "Machine learning is a subset of artificial intelligence that enables computers to learn from data without being explicitly programmed. It focuses on developing algorithms that can identify patterns and make decisions.",
  },
  {
    id: "doc-2",
    content:
      "Deep learning is a specialized form of machine learning that uses neural networks with multiple layers. It has revolutionized fields like computer vision, natural language processing, and speech recognition.",
  },
  {
    id: "doc-3",
    content:
      "Neural networks are computing systems inspired by biological neural networks in animal brains. They consist of interconnected nodes (neurons) organized in layers that process and transmit information.",
  },
];

/**
 * Build the embedder, retriever and llm for the selected mode.
 * Online mode reads OPENAI_API_KEY and PINECONE_API_KEY.
 */
function createComponents() {
  if (USE_MOCK) {
    const embedder = new LocalEmbedder();
    embedder.train(documents.map((d) => d.content));
    return {
      embedder,
      retriever: new MemoryRetriever(),
      llm: extractiveLLM,
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is required. Set it in .env or run with --mock",
    );
  }
  const openai = new OpenAIConnector({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    embeddingModel:
      process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    maxTokens: 500,
  });
  return {
    embedder: openai,
    // Reads PINECONE_API_KEY; the index must exist, with the embedding
    // model's dimension (1536 for text-embedding-3-small) and cosine metric
    retriever: new PineconeRetriever({
      index: process.env.PINECONE_INDEX_NAME || "rag-pipeline-demo",
    }),
    llm: openai,
  };
}

/** @param {object} [components] - { embedder, retriever, llm } (tests can inject fakes) */
async function main(components) {
  console.log("\nRAG Pipeline - OpenAI + Pinecone");
  console.log("================================\n");
  if (USE_MOCK) {
    console.log(
      "MOCK MODE: LocalEmbedder + MemoryRetriever + stub llm (no API calls)\n",
    );
  }

  const { embedder, retriever, llm } = components || createComponents();

  // 1. Embed and store the documents.
  console.log(`Embedding ${documents.length} documents...`);
  const vectors = [];
  for (const doc of documents) {
    vectors.push({
      id: doc.id,
      vector: await embedder.embed(doc.content),
      content: doc.content,
      metadata: { source: doc.id },
    });
  }
  await retriever.store(vectors);
  console.log(`Stored ${vectors.length} vectors\n`);

  // 2. Query through the pipeline.
  const pipeline = createRagPipeline({ embedder, retriever, llm });
  const query = "What is machine learning?";
  console.log(`Query: ${query}\n`);

  const result = await pipeline.run({
    query,
    options: { topK: 3, citations: true, evaluate: true, timeout: 60000 },
  });
  if (!result.success) {
    throw new Error(`Pipeline failed: ${result.error}`);
  }

  console.log(`Retrieved ${result.results.length} documents:`);
  for (const r of result.results) {
    console.log(`  ${r.id}  score=${r.score.toFixed(3)}`);
  }
  console.log("\nAnswer:");
  console.log("-".repeat(60));
  console.log(result.answer);
  console.log("-".repeat(60));
  console.log(`Groundedness: ${result.citations.groundednessScore.toFixed(2)}`);
  console.log(
    "Evaluation:  ",
    Object.entries(result.evaluation.scores)
      .map(([k, v]) => `${k}=${v.toFixed(2)}`)
      .join(" "),
  );
  console.log("\nPipeline completed successfully.\n");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("\nError:", error.message);
    if (error.code) console.error("Code: ", error.code);
    console.error("\nTroubleshooting:");
    console.error("1. Check OPENAI_API_KEY and PINECONE_API_KEY in .env");
    console.error(
      "2. Ensure the Pinecone index exists with dimension 1536 (cosine)",
    );
    console.error("3. Verify your network connection");
    console.error("4. Try offline mode: node index.js --mock\n");
    process.exit(1);
  });
}

module.exports = { PineconeRetriever, createComponents, documents, main };
