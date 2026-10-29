---
id: Concepts-Connectors
title: "Connectors: providers and stores"
sidebar_label: Connectors
description: Provider integrations for embedders, vector stores, and LLMs. Swappable, contract-validated, and isolatable from your pipeline orchestration.
---

# Concept: rag-connectors

The framework's connector layer is the boundary between the pipeline
and the outside world: embedding providers, vector stores, LLM APIs,
document loaders. Every connector implements a [plugin contract](./Plugins)
defined as a JSON schema in `contracts/`.

## What's in rag-connectors

### Embedders

| Connector          | Notes                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OpenAIConnector`  | `embed()` / `embedQuery()` via OpenAI embeddings (`embeddingModel`, default `text-embedding-3-small`). Reads `OPENAI_API_KEY`.                           |
| `CohereConnector`  | `embed()` / `embedQuery()` via Cohere embed; also `rerank()`. Reads `COHERE_API_KEY`.                                                                    |
| `OllamaConnector`  | `embed()` / `embedQuery()` against a local Ollama server.                                                                                                |
| `LocalEmbedder`    | Pure-JS TF-IDF for development, tests and small corpora. No network. Fit it with `train(documents)`; `getState()` / `setState()` persist the vocabulary. |
| Custom (your code) | Implement the `embedder` contract: `embed(text, { signal })` returning `number[]` (optionally `embedQuery()` for queries).                               |

### Retrievers / Vector stores

| Connector                            | Notes                                                                                                                                                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MemoryRetriever`                    | In-process cosine-similarity store. Needs a `queryVector` (pass an embedder to the pipeline). Enforces `maxDocuments` (default 100000; `eviction: 'fifo'` drops the oldest) and rejects mismatched vector dimensions. |
| `FileVectorStore`                    | JSON-file vector index with atomic writes, embedder/dimension tracking and per-source re-ingestion. Used by the CLI (`file-store`, `.rag/index.json`).                                                                |
| `HybridRetriever`                    | Combines several retrievers (e.g. vector + `BM25Search`) with Reciprocal Rank Fusion.                                                                                                                                 |
| `GraphRetriever`                     | Knowledge-graph retrieval over extracted entities.                                                                                                                                                                    |
| Pinecone, Weaviate, Qdrant, pgvector | Build your own retriever using the documented contract — examples in [Examples](./Examples).                                                                                                                          |

### LLMs

| Connector            | Notes                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `OpenAIConnector`    | OpenAI Chat Completions (default model `gpt-4o-mini`) + streaming via `generateStream()`.                                               |
| `AnthropicConnector` | Anthropic Messages API + streaming. Reads `ANTHROPIC_API_KEY`.                                                                          |
| `OllamaConnector`    | Local Ollama server for offline development and self-hosted production.                                                                 |
| Custom               | Implement the `llm` contract: `generate(query, docs, { signal, ...options })` returning a string, and optionally `generateStream(...)`. |

All built-in connectors retry only transient failures (network errors, 408/409/425/429/5xx) with exponential backoff, jitter and `Retry-After`, fail fast with `MISSING_API_KEY` when no key is configured, honour the run's `AbortSignal`, and pass retrieved context to the model as delimited, untrusted reference data in the user message.

### OpenAI-compatible providers (`baseURL`)

`OpenAIConnector` works with any server that implements the OpenAI API (Groq, Together, the Hugging Face router, vLLM, LM Studio, Ollama's `/v1` endpoint) when you pass `baseURL` and the provider's model names.

```javascript no-run
import { OpenAIConnector } from "@devilsdev/rag-pipeline-utils";

// A hosted provider: pass its key explicitly.
const groq = new OpenAIConnector({
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY,
  model: "llama-3.1-8b-instant",
});

// A local server that needs no key.
const local = new OpenAIConnector({
  baseURL: "http://localhost:1234/v1",
  model: "qwen2.5-7b-instruct",
  embeddingModel: "nomic-embed-text",
});
```

With a custom `baseURL` the connector **never** reads `OPENAI_API_KEY`, so your OpenAI key is not sent to another provider. Pass `apiKey` for hosted providers, or leave it out for local servers that need none.

### Loaders

| Connector                                           | Notes                                                             |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| Built-in document reader (`auto` loader in the CLI) | Markdown, HTML, CSV and plain text files, or a directory of them. |
| Custom                                              | Implement the `loader` contract: `load()`.                        |

### Rerankers

| Connector           | Notes                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `ScoringReranker`   | Lexical (BM25-style) scoring on top of vector retrieval.                                               |
| `EmbeddingReranker` | Re-scores with an embedder; LRU cache of document embeddings (`cacheSize`), `concurrency` (default 4). |
| `CascadeReranker`   | Chains rerankers (cheap first, expensive last) for cost-effective reranking.                           |
| `CohereConnector`   | `rerank()` via Cohere's rerank API.                                                                    |

## Why a connector layer

Three reasons:

1. **Vendor independence.** You can swap OpenAI for Anthropic without
   touching pipeline code. The pipeline doesn't know which LLM it's
   calling.
2. **Contract enforcement.** Every connector must satisfy a JSON
   schema in `contracts/`. Plugins that don't register fail loudly,
   not silently.
3. **Isolated security review.** When you add a new provider, the
   review surface is one file implementing one contract — not a
   pipeline-wide refactor.

## Adding a connector

```js no-run
import {
  pluginRegistry,
  createRagPipeline,
} from "@devilsdev/rag-pipeline-utils";

const myEmbedder = {
  metadata: { name: "vendor-x-embedder", version: "1.0.0", type: "embedder" },
  async embed(text, { signal } = {}) {
    /* call vendor X, passing signal to fetch */
    return vector; // number[]
  },
};

await pluginRegistry.register("embedder", "vendor-x-embedder", myEmbedder);

// Now usable by name
const pipeline = createRagPipeline({
  embedder: "vendor-x-embedder",
  retriever,
  llm,
});
```

The registry checks the plugin's `metadata` (`name`, `version`, `type`) and validates it against
`contracts/embedder-contract.json` on registration; registration throws if either check fails. See [Plugins](./Plugins) for the full guide.

## Stability

Connector classes shipped in the package are part of the public API
surface and follow the [SEMVER policy](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SEMVER.md).

Connector **contracts** in `contracts/` are also stable. Adding new
optional fields is non-breaking; removing or renaming required fields
is breaking and ships only in major versions.

## Related

- [Plugins](./Plugins) — full plugin development guide
- [Architecture](./Architecture.md#plugin-system) — internal plugin registry design
- [Examples](./Examples) — recipe for a custom Pinecone retriever, custom embedder, etc.
