---
id: Concepts-Core
title: "Core: pipeline and contracts"
sidebar_label: Core
description: The pipeline orchestrator, plugin registry, and primitive contracts. The minimal surface you need to run a RAG query end-to-end.
---

# Concept: rag-core

The framework is internally organized around four conceptual modules.
**rag-core** is the orchestrator and contract layer — the pieces every
pipeline needs, regardless of which connectors, evaluators, or
guardrails you bolt on top.

> **Why "concepts" and not separate packages?**
> Today everything ships as one npm package. The conceptual modules
> describe **what code is responsible for what** so you can reason
> about blast radius, security review scope, and dependency footprint
> without us splitting the codebase. A real monorepo split is on the
> [roadmap](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/README.md#roadmap).

## What's in rag-core

| Surface                                                                       | Purpose                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createRagPipeline({ loader, embedder, retriever, llm, reranker, registry })` | The factory. Wires the components into a runnable pipeline and returns `{ run, cleanup }`.                                                                                  |
| `run({ query, queryVector, options })`                                        | The main execution entry point. Resolves `{ success, query, results, answer, citations?, evaluation? }`; failures, timeouts and aborts resolve `{ success: false, error }`. |
| `pluginRegistry`                                                              | Holds registered loader, embedder, retriever, reranker and LLM plugins by name. Validates them against the contract schemas in `contracts/`.                                |
| Plugin contracts                                                              | JSON files in `contracts/` that define the required methods for each plugin type.                                                                                           |
| Cancellation                                                                  | Each run creates an `AbortController`; its signal reaches every component call. `options.signal` lets callers cancel and `options.timeout` aborts the run.                  |
| `retry` / `withRetry`                                                         | Retry helpers with backoff for your own components (the built-in connectors already retry transient failures).                                                              |
| `logger`                                                                      | `pino`-based structured logger.                                                                                                                                             |

## Minimum viable pipeline

```js
import {
  createRagPipeline,
  MemoryRetriever,
  OpenAIConnector,
} from "@devilsdev/rag-pipeline-utils";

const openai = new OpenAIConnector({ apiKey: process.env.OPENAI_API_KEY });

const pipeline = createRagPipeline({
  embedder: openai, // embeds the query for vector search
  retriever: new MemoryRetriever(), // populate with retriever.store([...])
  llm: openai,
});

const result = await pipeline.run({ query: "What does X do?" });
```

That's it. No evaluation, no guardrails, no GraphRAG — just retrieval
and generation. Add layers as needed.

## When to extend rag-core

You're operating in **rag-core** territory when you:

- Build a custom plugin (loader, embedder, retriever, reranker, LLM)
- Configure run behaviour (`topK`, `timeout`, cancellation via `signal`,
  streaming, the `filterResults` hook)
- Tune logging, observability, correlation tracking
- Need to compose multiple pipelines (e.g. a planner + executor pattern)

## When to leave rag-core alone

You **don't** need to touch rag-core internals when you:

- Swap providers — that's [rag-connectors](./Concepts-Connectors)
- Add quality scoring — that's [rag-eval](./Concepts-Evaluation)
- Add safety filters — that's [rag-guardrails](./Concepts-Guardrails)

## Stability

Everything documented in the [API reference](./API-Reference) under
"Core" is stable per the [SEMVER policy](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SEMVER.md).

Internal modules (plugin registry private methods, CLI internals, etc.)
may change in patch releases. Experimental modules (see
[Experimental](./Experimental)) are not covered by SEMVER.

## Related

- [Architecture](./Architecture) — the deeper reference on how these
  pieces fit together
- [Plugins](./Plugins) — building custom plugins against the contracts
- [API reference](./API-Reference) — full export list
