# rag-pipeline-utils

The complete Node.js toolkit for production-grade RAG — evaluation, citation, agentic reasoning, guardrails, and 7 provider connectors in one package.

[![npm version](https://img.shields.io/npm/v/@devilsdev/rag-pipeline-utils.svg)](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils)
[![Downloads](https://img.shields.io/npm/dm/@devilsdev/rag-pipeline-utils.svg)](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils)
[![Types](https://img.shields.io/npm/types/@devilsdev/rag-pipeline-utils.svg)](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils)
[![License](https://img.shields.io/badge/License-GPL%203.0-blue.svg)](https://opensource.org/licenses/GPL-3.0)
[![Node.js](https://img.shields.io/node/v/@devilsdev/rag-pipeline-utils.svg)](https://nodejs.org/)

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

**Requirements:** Node.js ≥ 18

## Why

Most RAG solutions force vendor lock-in, opinionated architectures, or sacrifice observability for simplicity. `rag-pipeline-utils` gives you modular building blocks with clear contracts — every component is swappable, every decision is yours.

- **Modular** — swap any component without rewriting your pipeline
- **Evaluated** — faithfulness, relevance, and groundedness metrics on every run
- **Safe** — 3-layer guardrails: prompt injection detection, ACL filtering, PII detection
- **Observable** — OpenTelemetry tracing, Prometheus metrics, audit logs
- **Connected** — OpenAI, Anthropic, Cohere, Ollama, or bring your own

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

Each stage is optional and pluggable.

## Features

| Category       | Capabilities                                                             |
| -------------- | ------------------------------------------------------------------------ |
| **Chunking**   | 5 strategies: sentence, fixed-size, recursive, semantic, structure-aware |
| **Retrieval**  | Hybrid vector + BM25 with Reciprocal Rank Fusion                         |
| **Reranking**  | LLM, BM25 scoring, embedding similarity, or cascade                      |
| **Evaluation** | Faithfulness, relevance, context precision/recall, groundedness          |
| **Citation**   | Source attribution per sentence, hallucination detection                 |
| **Agentic**    | Query planning, iterative retrieval, self-critique via DAG engine        |
| **Guardrails** | Injection detection, PII filtering, ACL-aware access control             |
| **GraphRAG**   | Knowledge graph construction with entity extraction                      |
| **Streaming**  | SSE and WebSocket adapters with backpressure control                     |
| **Cost**       | Token tracking, budget enforcement, provider pricing models              |
| **Debugging**  | Execution tracing, bottleneck detection, replay                          |
| **MCP**        | Expose pipelines as Model Context Protocol tools                         |
| **Security**   | JWT replay protection, plugin sandboxing, audit logs                     |
| **Enterprise** | Multi-tenancy, SSO (SAML/OAuth2/AD/OIDC), data governance                |

**104 public exports** across the full RAG lifecycle. See [full documentation](https://devilsdev.github.io/rag-pipeline-utils/) for complete API reference.

## Provider Connectors

```javascript
import {
  OpenAIConnector, // GPT-4, text-embedding-3
  AnthropicConnector, // Claude 3 Opus, Sonnet, Haiku
  CohereConnector, // Embed + Rerank
  OllamaConnector, // Llama 3, Mistral (local)
  LocalEmbedder, // TF-IDF (offline, no API)
  MemoryRetriever, // In-memory cosine similarity
} from "@devilsdev/rag-pipeline-utils";
```

## Documentation

- **[Full documentation](https://devilsdev.github.io/rag-pipeline-utils/)** — guides, API reference, deployment
- **[Architecture guide](https://devilsdev.github.io/rag-pipeline-utils/docs/Architecture)** — pipeline internals
- **[API reference](https://devilsdev.github.io/rag-pipeline-utils/docs/API-Reference)** — all 104 exports
- **[Examples](https://devilsdev.github.io/rag-pipeline-utils/docs/Examples)** — chatbot, Q&A, code search, support

## Roadmap

**Current (v2.4):** chunking, citation, evaluation, agentic RAG, hybrid retrieval, 3-layer guardrails, GraphRAG, streaming, cost management, MCP integration, 7 provider connectors.

**Next (v3.0):** intelligent caching, native Rust bindings, Kubernetes operator, edge deployment (Cloudflare Workers, Deno Deploy).

Vote on features in [GitHub Discussions](https://github.com/DevilsDev/rag-pipeline-utils/discussions/categories/roadmap).

## Community

- **[GitHub Discussions](https://github.com/DevilsDev/rag-pipeline-utils/discussions)** — ask questions, share use cases
- **[Issues](https://github.com/DevilsDev/rag-pipeline-utils/issues)** — report bugs, request features
- **[Contributing guide](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/docs/CONTRIBUTING.md)** — submit pull requests
- **[Code of Conduct](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/CODE_OF_CONDUCT.md)**

## License

GPL-3.0 — see [LICENSE](LICENSE) for full terms.

---

**Star the repo** if you find it useful. **Share your use case** in [Discussions](https://github.com/DevilsDev/rag-pipeline-utils/discussions/categories/show-and-tell).
