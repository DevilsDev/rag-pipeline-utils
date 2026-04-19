---
id: Concepts-Core
title: Concept — rag-core
sidebar_label: Core (rag-core)
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
> [v3.0 roadmap](../README#roadmap).

## What's in rag-core

| Surface                            | Purpose                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `createRagPipeline(config)`        | The factory. Wires loader / chunker / embedder / retriever / reranker / LLM into a runnable pipeline.                                 |
| `Pipeline.run({ query, options })` | The main execution entry point. Returns retrieved documents, generated answer, citations, and evaluation.                             |
| Plugin registry                    | Holds registered loader, embedder, retriever, reranker, and LLM plugins. Validates them against the contract schemas in `contracts/`. |
| Plugin contracts                   | JSON Schema files in `contracts/` that define the required interface for each plugin type.                                            |
| DAG engine                         | Internal execution graph. Manages parallelism, retries, and tracing.                                                                  |
| Retry policies                     | Configurable backoff + circuit breaker for transient failures.                                                                        |
| Structured logger                  | `pino`-based, correlation-aware, with secret redaction.                                                                               |

## Minimum viable pipeline

```js
import {
  createRagPipeline,
  MemoryRetriever,
  OpenAIConnector,
} from "@devilsdev/rag-pipeline-utils";

const pipeline = createRagPipeline({
  retriever: new MemoryRetriever(),
  llm: new OpenAIConnector({ apiKey: process.env.OPENAI_API_KEY }),
});

const result = await pipeline.run({ query: "What does X do?" });
```

That's it. No evaluation, no guardrails, no GraphRAG — just retrieval
and generation. Add layers as needed.

## When to extend rag-core

You're operating in **rag-core** territory when you:

- Build a custom plugin (loader, embedder, retriever, reranker, LLM)
- Configure pipeline orchestration (concurrency, retry policies,
  circuit breakers)
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

Internal modules (DAG executor internals, plugin registry private
methods, etc.) may change in patch releases.

## Related

- [Architecture](./Architecture) — the deeper reference on how these
  pieces fit together
- [Plugins](./Plugins) — building custom plugins against the contracts
- [API reference](./API-Reference) — full export list
