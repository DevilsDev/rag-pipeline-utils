/**
 * Basic RAG Pipeline Example
 * Demonstrates minimal plugin implementation and DAG execution
 */

const {
  DAGEngine,
  pluginRegistry,
  logger,
} = require("@devilsdev/rag-pipeline-utils");

// Example 1: Simple loader plugin
class BasicTextLoader {
  async load(filePath) {
    logger.info("Loading document", { filePath });
    // In real implementation: read and parse file
    return {
      content: "Sample document text about RAG pipelines and vector databases.",
      metadata: { source: filePath, timestamp: new Date().toISOString() },
    };
  }
}

// Example 2: Mock embedder plugin
class MockEmbedder {
  async embed(texts) {
    logger.info("Embedding texts", { count: texts.length });
    // In real implementation: call embedding API (OpenAI, Cohere, etc.)
    return texts.map(() =>
      Array(384)
        .fill(0)
        .map(() => Math.random()),
    );
  }
}

// Example 3: Mock retriever plugin
class MockRetriever {
  constructor() {
    this.store = [];
  }

  async store(vectors, metadata) {
    logger.info("Storing vectors", { count: vectors.length });
    this.store.push({ vectors, metadata });
    return { stored: vectors.length, totalStored: this.store.length };
  }

  async retrieve(queryVector, topK = 5) {
    logger.info("Retrieving similar documents", { topK });
    // In real implementation: perform similarity search
    return this.store.slice(0, topK).map((item, i) => ({
      score: 1 - i * 0.1,
      metadata: item.metadata,
    }));
  }
}

// Register plugins
pluginRegistry.register("loader", "basic-text", new BasicTextLoader());
pluginRegistry.register("embedder", "mock", new MockEmbedder());
pluginRegistry.register("retriever", "mock", new MockRetriever());

// Example 4: DAG-based RAG pipeline workflow
async function runPipeline() {
  console.log("\n=== RAG Pipeline Example ===\n");

  const dag = new DAGEngine({
    timeout: 30000,
    continueOnError: false,
  });

  // Define pipeline nodes
  dag.addNode("load", async (input) => {
    const loader = pluginRegistry.get("loader", "basic-text");
    return loader.load(input.filePath);
  });

  dag.addNode("embed", async (document) => {
    const embedder = pluginRegistry.get("embedder", "mock");
    const embeddings = await embedder.embed([document.content]);
    return {
      ...document,
      embeddings,
    };
  });

  dag.addNode("store", async (data) => {
    const retriever = pluginRegistry.get("retriever", "mock");
    const result = await retriever.store(data.embeddings, data.metadata);
    return {
      ...data,
      storageResult: result,
    };
  });

  dag.addNode("query", async (data) => {
    const retriever = pluginRegistry.get("retriever", "mock");
    // In real implementation: embed the query first
    const mockQueryVector = Array(384)
      .fill(0)
      .map(() => Math.random());
    const results = await retriever.retrieve(mockQueryVector, 3);
    return {
      query: "What are RAG pipelines?",
      results,
    };
  });

  // Connect workflow: load -> embed -> store -> query
  dag.connect("load", "embed");
  dag.connect("embed", "store");
  dag.connect("store", "query");

  // Validate DAG before execution
  try {
    dag.validate();
    console.log("✓ DAG validation passed\n");
  } catch (error) {
    console.error("✗ DAG validation failed:", error.message);
    process.exit(1);
  }

  // Execute pipeline
  try {
    const startTime = Date.now();
    const results = await dag.execute({ filePath: "./sample-document.txt" });
    const duration = Date.now() - startTime;

    console.log("\n=== Pipeline Results ===\n");
    console.log("Document loaded:", results.get("load").metadata);
    console.log(
      "Embeddings generated:",
      results.get("embed").embeddings.length,
      "vectors",
    );
    console.log("Storage result:", results.get("store").storageResult);
    console.log(
      "Query results:",
      JSON.stringify(results.get("query").results, null, 2),
    );
    console.log("\n✓ Pipeline completed in", duration, "ms");
  } catch (error) {
    console.error("\n✗ Pipeline failed:", error.message);
    if (error.nodeId) {
      console.error("  Failed at node:", error.nodeId);
    }
    process.exit(1);
  }
}

// Run the example
runPipeline().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
