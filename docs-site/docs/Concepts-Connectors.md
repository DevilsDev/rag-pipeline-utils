---
id: Concepts-Connectors
title: Concept — rag-connectors
sidebar_label: Connectors (rag-connectors)
description: Provider integrations for embedders, vector stores, and LLMs. Swappable, contract-validated, and isolatable from your pipeline orchestration.
---

# Concept: rag-connectors

The framework's connector layer is the boundary between the pipeline
and the outside world: embedding providers, vector stores, LLM APIs,
document loaders. Every connector implements a [plugin contract](./Plugins)
defined as a JSON schema in `contracts/`.

## What's in rag-connectors

### Embedders

| Connector            | Notes                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `OpenAIEmbedder`     | Calls OpenAI's `embeddings` API. Configurable model (`text-embedding-3-small`, `-3-large`, `ada-002`). Batch + retry built in. |
| `CohereEmbedder`     | Calls Cohere's `embed` API. Supports the `embed-multilingual-v3.0` family.                                                     |
| `LocalTfidfEmbedder` | Pure-JS TF-IDF for development, tests, and small corpora. No network.                                                          |
| Custom (your code)   | Implement the `embedder` contract — one async `embed(texts: string[])` method returning `number[][]`.                          |

### Retrievers / Vector stores

| Connector                            | Notes                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `MemoryRetriever`                    | In-process cosine-similarity store. Honors `tenantId` for multi-tenant scoping. Production-suitable for small corpora (under 100k chunks). |
| Pinecone, Weaviate, Qdrant, pgvector | Build your own retriever using the documented contract — examples in [Examples](./Examples).                                               |

### LLMs

| Connector            | Notes                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `OpenAIConnector`    | OpenAI Chat Completions + streaming. Cost tracking integrated.                                            |
| `AnthropicConnector` | Anthropic Messages API + streaming.                                                                       |
| `OllamaConnector`    | Local Ollama server for offline development and self-hosted production.                                   |
| Custom               | Implement the `llm` contract: one `generate({ prompt, context, options })` and an optional `stream(...)`. |

### Loaders

| Connector                                                  | Notes                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------- |
| Document loaders for PDF, DOCX, HTML, Markdown, plain text | Configurable per-format.                                      |
| Custom                                                     | Implement the `loader` contract: `load(source) → Document[]`. |

### Rerankers

| Connector           | Notes                                                                        |
| ------------------- | ---------------------------------------------------------------------------- |
| `BM25Reranker`      | Lexical reranking on top of vector retrieval.                                |
| `EmbeddingReranker` | Re-scores using a different embedding model than retrieval.                  |
| `LLMReranker`       | LLM-judged relevance scoring. Slowest and highest quality.                   |
| `CascadedReranker`  | Chains the above (cheap first, expensive last) for cost-effective reranking. |

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

```js
import { pluginRegistry } from "@devilsdev/rag-pipeline-utils";

const myEmbedder = {
  name: "vendor-x-embedder",
  type: "embedder",
  version: "1.0.0",
  async embed(texts) {
    /* call vendor X */
    return embeddings;
  },
};

pluginRegistry.register(myEmbedder);
// Now usable in createRagPipeline({ embedder: "vendor-x-embedder" })
```

The registry validates the plugin against `contracts/embedder-contract.json`
on registration. See [Plugins](./Plugins) for the full guide.

## Stability

Connector classes shipped in the package are part of the public API
surface and follow the [SEMVER policy](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SEMVER.md).

Connector **contracts** in `contracts/` are also stable. Adding new
optional fields is non-breaking; removing or renaming required fields
is breaking and ships only in major versions.

## Related

- [Plugins](./Plugins) — full plugin development guide
- [Architecture](./Architecture#plugin-system) — internal plugin registry design
- [Examples](./Examples) — recipe for a custom Pinecone retriever, custom embedder, etc.
