# rag-pipeline-utils

**Composable RAG for Node.js — with built-in evaluation, citations, guardrails, and observability.**

[![npm version](https://img.shields.io/npm/v/@devilsdev/rag-pipeline-utils.svg)](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils)
[![Downloads](https://img.shields.io/npm/dm/@devilsdev/rag-pipeline-utils.svg)](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils)
[![Types](https://img.shields.io/npm/types/@devilsdev/rag-pipeline-utils.svg)](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/node/v/@devilsdev/rag-pipeline-utils.svg)](https://nodejs.org/)

Start small with three core primitives — **pipeline**, **plugin**, **connector** — and opt in to evaluation, citations, guardrails, agentic reasoning, and GraphRAG as you need them.

## Installation

```bash
npm install @devilsdev/rag-pipeline-utils
```

## Quick Start

```javascript
import {
  createRagPipeline,
  OpenAIConnector,
  MemoryRetriever,
} from "@devilsdev/rag-pipeline-utils";

const pipeline = createRagPipeline({
  retriever: new MemoryRetriever(),
  llm: new OpenAIConnector({ apiKey: process.env.OPENAI_API_KEY }),
});

const result = await pipeline.run({
  query: "What is the vacation policy?",
  options: { citations: true, evaluate: true },
});

console.log(result.results); // retrieved documents
console.log(result.citations.groundednessScore); // 0.85
console.log(result.evaluation.scores); // { faithfulness, relevance, ... }
```

**Requirements:** Node.js ≥ 18 · ESM or CommonJS

## Who This Is For

Teams building **production Node.js RAG services** who need:

- **Grounded outputs** they can trace back to sources
- **Modular architecture** that doesn't lock them into a single provider
- **Operational discipline** — tracing, metrics, cost controls, guardrails
- **A stable foundation** with clear plugin contracts that outlast any vendor

If you're looking for a framework you can grow into — start with retrieval, add evaluation when it matters, add guardrails when you ship to production — this is built for you.

## Use Cases

### Document Q&A with citations

```javascript
const result = await pipeline.run({
  query: "Which policy covers remote work?",
  options: { citations: true },
});
// result.citations maps each answer sentence to its source documents
```

### Internal knowledge assistant with evaluation

```javascript
const result = await pipeline.run({
  query: userQuestion,
  options: { evaluate: true },
});
// result.evaluation.scores = { faithfulness, relevance, contextPrecision, ... }
// Alert when faithfulness drops below threshold in production
```

### Enterprise service with guardrails

```javascript
import { GuardrailsPipeline, createRagPipeline } from "@devilsdev/rag-pipeline-utils";

const safePipeline = new GuardrailsPipeline(createRagPipeline({ ... }), {
  preRetrieval:  { enableInjectionDetection: true },
  retrieval:     { minRelevanceScore: 0.6 },
  postGeneration:{ enablePIIDetection: true, enableGroundednessCheck: true },
});
```

## Architecture

```
Ingestion:  Documents → Chunking → Embedder → Vector Store

Query:      User Query
              ↓
            Guardrails      → prompt injection, topic filtering
              ↓
            Query Planner   → decomposes complex queries
              ↓
            Hybrid Retriever → vector + BM25 with Reciprocal Rank Fusion
              ↓
            Reranker        → BM25 / embedding / cascade
              ↓
            LLM             → generates answer from context
              ↓
            Citation Tracker → maps sentences to sources
              ↓
            Evaluator       → scores faithfulness & groundedness
              ↓
            Response { answer, citations, evaluation }
```

Each stage is optional, pluggable, and observable.

## Capabilities

Opt in only to what you need:

| Capability     | What you get                                                             |
| -------------- | ------------------------------------------------------------------------ |
| **Chunking**   | 5 strategies: sentence, fixed-size, recursive, semantic, structure-aware |
| **Retrieval**  | Hybrid vector + BM25 with Reciprocal Rank Fusion                         |
| **Reranking**  | LLM, BM25 scoring, embedding similarity, or cascade                      |
| **Evaluation** | Faithfulness, relevance, context precision/recall, groundedness          |
| **Citation**   | Per-sentence source attribution, hallucination detection                 |
| **Agentic**    | Query planning, iterative retrieval, self-critique                       |
| **Guardrails** | Injection detection, PII filtering, ACL-aware access control             |
| **GraphRAG**   | Knowledge graph construction with entity extraction                      |
| **Streaming**  | SSE and WebSocket adapters with backpressure control                     |
| **Cost**       | Token tracking, budget enforcement, provider pricing                     |
| **Debugging**  | Execution tracing, bottleneck detection                                  |
| **MCP**        | Expose pipelines as Model Context Protocol tools                         |
| **Enterprise** | Multi-tenancy, SSO (SAML/OAuth2/AD/OIDC), audit logs                     |

See [full documentation](https://devilsdev.github.io/rag-pipeline-utils/) for complete API reference.

## Provider Connectors

Built-in connectors for popular providers — or implement the contract for your own:

```javascript
import {
  OpenAIConnector, // GPT-4, text-embedding-3
  AnthropicConnector, // Claude 3 Opus, Sonnet, Haiku
  CohereConnector, // Embed + Rerank
  OllamaConnector, // Llama 3, Mistral (local, offline)
  LocalEmbedder, // TF-IDF (offline, no API)
  MemoryRetriever, // In-memory cosine similarity
} from "@devilsdev/rag-pipeline-utils";
```

## Documentation

- **[Documentation site](https://devilsdev.github.io/rag-pipeline-utils/)** — guides, API reference, deployment
- **[Architecture](https://devilsdev.github.io/rag-pipeline-utils/docs/Architecture)** — plugin contracts, pipeline internals
- **[API reference](https://devilsdev.github.io/rag-pipeline-utils/docs/API-Reference)** — complete export index
- **[Examples](https://devilsdev.github.io/rag-pipeline-utils/docs/Examples)** — chatbot, Q&A, code search, support
- **[Comparison vs LangChain.js / LlamaIndex.TS](https://devilsdev.github.io/rag-pipeline-utils/docs/Comparison)** — honest decision framework
- **[Runnable demo](examples/fastify-rag-demo)** — Fastify + OpenAI + guardrails, deployable in one command
- **[Benchmarks & methodology](BENCHMARKS.md)** — how we measure, how you reproduce
- **[Security policy](SECURITY.md)** — responsible disclosure, supported versions
- **[Security capability matrix](https://devilsdev.github.io/rag-pipeline-utils/docs/Security-Capabilities)** — what's battle-tested vs. recommended vs. example
- **[API stability policy (SEMVER.md)](SEMVER.md)** — what counts as breaking, deprecation windows
- **[Changelog](CHANGELOG.md)** — release history

## Roadmap

**Current (v2.4):** chunking, citation, evaluation, agentic RAG, hybrid retrieval, 3-layer guardrails, GraphRAG, streaming, cost management, MCP integration, 7 provider connectors.

**Next (v3.0):** intelligent caching, native Rust bindings, Kubernetes operator, edge deployment.

Vote on features in [GitHub Discussions](https://github.com/DevilsDev/rag-pipeline-utils/discussions/categories/roadmap).

## Community

- **[GitHub Discussions](https://github.com/DevilsDev/rag-pipeline-utils/discussions)** — ask questions, share use cases
- **[Issues](https://github.com/DevilsDev/rag-pipeline-utils/issues)** — report bugs, request features
- **[Contributing guide](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/docs/CONTRIBUTING.md)**

## License

MIT — see [LICENSE](LICENSE).
