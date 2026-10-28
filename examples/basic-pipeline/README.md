# Basic RAG Pipeline Example

A minimal, fully offline RAG pipeline built with
`@devilsdev/rag-pipeline-utils`. No API keys or network access needed.

## What This Example Shows

1. **Indexing** with the built-in `LocalEmbedder` (TF-IDF) and
   `MemoryRetriever` (in-memory cosine similarity)
2. **A custom LLM plugin** registered on `pluginRegistry` and referenced by
   name in `createRagPipeline()`
3. **`pipeline.run()`** with citations and evaluation
4. **Retrieval-only mode**: without an `llm`, `answer` is `null`
5. **Cancellation** through `options.signal` (an `AbortSignal`)

## Prerequisites

- Node.js 18 or higher

## Run the Example

```bash
npm install
npm start
```

Or directly: `node index.js`. The example always runs offline.

## Expected Output

```
=== Basic RAG pipeline (offline) ===

Indexed 4 documents (60 dimensions)

Query:    How does a vector database find similar documents?
Answer:   A vector database stores embeddings and finds the nearest vectors to a query embedding.
Results:  vector-db (0.413), reranking (0.140)
Groundedness (citations): 1.00
Evaluation scores: faithfulness=1.00 relevance=0.28 contextPrecision=0.50 groundedness=0.79

--- Retrieval only (no llm) ---
Answer:   null
Top hit:  chunking

--- Cancelled run ---
success: false | error: Execution aborted

Done.
```

## Code Structure

### 1. Index documents

```javascript
const embedder = new LocalEmbedder();
embedder.train(documents.map((d) => d.content)); // build the vocabulary

const retriever = new MemoryRetriever();
await retriever.store(
  documents.map((d) => ({
    id: d.id,
    vector: embedder.embed(d.content),
    content: d.content,
    metadata: d.metadata,
  })),
);
```

### 2. Register a custom plugin

The pipeline calls `llm.generate(query, docs, { signal, ... })` and expects a
string. Registered plugins need `metadata: { name, version, type }`, and
`register()` returns a Promise:

```javascript
class ExtractiveLLM {
  constructor() {
    this.metadata = { name: "extractive-llm", version: "1.0.0", type: "llm" };
  }
  async generate(query, docs, options) { ... }
}

await pluginRegistry.register("llm", "extractive", new ExtractiveLLM());
```

### 3. Build and run the pipeline

```javascript
const pipeline = createRagPipeline({ embedder, retriever, llm: "extractive" });

const result = await pipeline.run({
  query: "How does a vector database find similar documents?",
  options: { topK: 2, citations: true, evaluate: true },
});
// { success, query, results, answer, citations, evaluation }
```

### 4. Cancel a run

```javascript
const controller = new AbortController();
const pending = pipeline.run({ query, options: { signal: controller.signal } });
controller.abort();
await pending; // { success: false, error: "Execution aborted" }
```

`options.timeout` (ms) works the same way and resolves
`{ success: false, error: "Execution timeout" }`.

## Next Steps

- Replace `ExtractiveLLM` with a real connector: `OpenAIConnector`,
  `AnthropicConnector` or `OllamaConnector`
- Use `OpenAIConnector` or `CohereConnector` as the embedder for semantic
  (not lexical) retrieval
- Persist the index with `FileVectorStore`, or use the CLI
  (`rag-pipeline init --template local`, `ingest`, `query`)
- Add `GuardrailsPipeline` and a reranker (`EmbeddingReranker`)

See [`../openai-pinecone`](../openai-pinecone) and
[`../fastify-rag-demo`](../fastify-rag-demo) for larger examples.

## Learn More

- [Main Documentation](../../README.md)
- [Core concepts](../../docs-site/docs/Concepts-Core.md)
- [Plugins](../../docs-site/docs/Plugins.md)
- [Configuration Schema](../../.ragrc.schema.json)

## Support

- [GitHub Issues](https://github.com/DevilsDev/rag-pipeline-utils/issues)
- [GitHub Discussions](https://github.com/DevilsDev/rag-pipeline-utils/discussions)
