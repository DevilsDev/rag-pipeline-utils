# Architecture

This page outlines the internal architecture of the RAG pipeline utilities, emphasizing modularity, plugin design, and SOLID-compliant structure.

---

## Core Design Philosophy

The architecture adheres to enterprise-grade practices:

- **Single Responsibility**: Each component handles one domain concern
- **Pluggable Interfaces**: Any layer (loader, retriever, LLM) can be swapped
- **Streaming-Ready**: Async flows support token-based output
- **Environment-Safe**: Config via `.ragrc.json`, not hardcoded
- **Testable**: All modules can be mocked and unit tested

---

## Layered Components

```
+-------------------------+
| createRagPipeline()     |
+-------------------------+
        |     |     |
        ▼     ▼     ▼
  Loader   Embedder  Retriever
     ▼        |         ▼
  Chunks   Embeddings  Context
        \     |     /
         ▼    ▼    ▼
           LLM Runner
             |
           Output
```

---

## Core Interfaces

Each plugin is registered via the `PluginRegistry` and looked up by key.

```ts
registry.register('loader', 'pdf', new PDFLoader())
const loader = registry.get('loader', 'pdf');
```

All plugins implement interface contracts like:

```ts
interface Loader {
  load(path: string): Promise<{ chunk(): string[] }[]>;
}

interface Embedder {
  embed(chunks: string[]): Vector[];
  embedQuery(prompt: string): Vector;
}

interface Retriever {
  store(vectors: Vector[]): Promise<void>;
  retrieve(query: Vector): Promise<Context[]>;
}
```

---

## DAG Support

The `dag-engine.js` module supports chaining multiple components:
- Example: Summarize → Retrieve → Rerank → LLM
- Enables more complex workflows than linear ingestion/query

---

Next → [Evaluation](./Evaluation.md)
