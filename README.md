# rag-pipeline-utils

**The comprehensive Node.js toolkit for building production-ready RAG pipelines — with built-in evaluation, citation tracking, agentic reasoning, guardrails, and 7 provider connectors.**

[![npm version](https://img.shields.io/npm/v/@devilsdev/rag-pipeline-utils.svg)](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils)
[![Downloads](https://img.shields.io/npm/dm/@devilsdev/rag-pipeline-utils.svg)](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils)
[![Install size](https://packagephobia.com/badge?p=@devilsdev/rag-pipeline-utils)](https://packagephobia.com/result?p=@devilsdev/rag-pipeline-utils)
[![Types](https://img.shields.io/npm/types/@devilsdev/rag-pipeline-utils.svg)](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL%203.0-blue.svg)](https://opensource.org/licenses/GPL-3.0)
[![Node.js Version](https://img.shields.io/node/v/@devilsdev/rag-pipeline-utils.svg)](https://nodejs.org/)
[![CI](https://github.com/DevilsDev/rag-pipeline-utils/actions/workflows/ci.yml/badge.svg)](https://github.com/DevilsDev/rag-pipeline-utils/actions)
[![codecov](https://codecov.io/gh/DevilsDev/rag-pipeline-utils/branch/main/graph/badge.svg)](https://codecov.io/gh/DevilsDev/rag-pipeline-utils)

---

## Why This Exists

Building RAG systems in Node.js shouldn't require stitching together Python tools or reinventing every component. **rag-pipeline-utils** gives you the complete stack in one package: loaders, embedders, retrievers, LLM connectors, rerankers, evaluation, citation tracking, guardrails, and agentic reasoning.

Every component follows clear contracts. Every integration is optional. Every decision is yours.

- **Modular** -- swap any component without rewriting your pipeline
- **Evaluated** -- built-in faithfulness, relevance, and groundedness metrics on every run
- **Safe** -- 3-layer guardrails with prompt injection detection, PII filtering, and source grounding
- **Observable** -- OpenTelemetry tracing, Prometheus metrics, and compliance-grade audit logs
- **Connected** -- OpenAI, Anthropic, Cohere, Ollama, or bring your own

---

## Quick Start

```bash
npm install @devilsdev/rag-pipeline-utils
```

Build a RAG pipeline with built-in connectors:

```javascript
const {
  createRagPipeline,
  OpenAIConnector,
  MemoryRetriever,
} = require("@devilsdev/rag-pipeline-utils");

const llm = new OpenAIConnector({ apiKey: process.env.OPENAI_API_KEY });
const retriever = new MemoryRetriever();

const pipeline = createRagPipeline({ retriever, llm });

const result = await pipeline.run({
  query: "What is the vacation policy?",
  options: { citations: true, evaluate: true },
});

console.log(result.results);
// Retrieved documents
console.log(result.citations?.groundednessScore);
// 0.85 -- how well the answer is grounded in sources
console.log(result.evaluation?.scores);
// { faithfulness: 0.9, relevance: 0.8, contextPrecision: 0.7, ... }
```

**Requirements:** Node.js >= 18.0.0

---

## Architecture

**Ingestion pipeline**

```
Documents → Chunking Engine → Embedder → Vector Store
```

**Query pipeline**

```
User Query
   ↓
Guardrails (pre-retrieval)       → blocks prompt injection, filters topics
   ↓
Query Planner                    → decomposes complex queries into sub-queries
   ↓
Retriever + BM25 (hybrid)        → vector similarity + keyword search with RRF
   ↓
Reranker                         → reorders by relevance (BM25 / embedding / cascade)
   ↓
LLM                              → generates answer from retrieved context
   ↓
Citation Tracker                 → maps sentences to sources, detects hallucinations
   ↓
Evaluator                        → scores faithfulness, relevance, groundedness
   ↓
Response { answer, citations, evaluation }
```

Each stage is optional, pluggable, and observable. Enable citation tracking and evaluation with a single option flag:

```javascript
await pipeline.run({ query, options: { citations: true, evaluate: true } });
```

---

## Features

### Plugin Architecture

Five plugin types with JSON Schema contracts: **loader**, **embedder**, **retriever**, **llm**, and **reranker**. Register, validate, and swap components at runtime.

```javascript
const { pluginRegistry } = require("@devilsdev/rag-pipeline-utils");
pluginRegistry.register("llm", "my-model", MyCustomLLM);
```

### Smart Chunking

Five built-in strategies for document splitting: `sentence`, `fixed-size`, `recursive` (default, 512 chars), `semantic` (topic-boundary detection), and `structure-aware` (respects Markdown headers, HTML sections, code blocks).

```javascript
const { ChunkingEngine } = require("@devilsdev/rag-pipeline-utils");
const engine = new ChunkingEngine({
  strategy: "recursive",
  chunkSize: 512,
  chunkOverlap: 50,
});
const chunks = engine.chunk(documentText);
```

### Hybrid Retrieval

Combine vector similarity with BM25 keyword search using Reciprocal Rank Fusion. Run multiple retrievers in parallel with graceful degradation.

```javascript
const {
  BM25Search,
  HybridRetriever,
} = require("@devilsdev/rag-pipeline-utils");
const bm25 = new BM25Search();
bm25.index(documents);

const hybrid = new HybridRetriever([
  { retriever: vectorRetriever, weight: 0.7, name: "vector" },
  { retriever: bm25, weight: 0.3, name: "keyword" },
]);
const results = await hybrid.retrieve({ query });
```

### RAG Evaluation

Measure pipeline quality with five built-in metrics: **faithfulness**, **answer relevance**, **context precision**, **context recall**, and **groundedness**. Run automatically on every pipeline execution or standalone.

```javascript
const { PipelineEvaluator } = require("@devilsdev/rag-pipeline-utils");
const evaluator = new PipelineEvaluator();
const metrics = evaluator.evaluate({ query, answer, results: retrievedDocs });
// metrics.scores.faithfulness, metrics.scores.relevance, etc.
```

Or inline: `pipeline.run({ query, options: { evaluate: true } })`

### Citation & Grounding

Track which source documents support each claim. Detect hallucinations automatically. Get a groundedness score for every answer.

```javascript
const { CitationTracker } = require("@devilsdev/rag-pipeline-utils");
const tracker = new CitationTracker();
const result = tracker.track(answer, retrievedDocs);
// result.groundednessScore, result.citations, result.hallucinationReport
```

### Agentic RAG

Multi-step retrieval with query decomposition, iterative search, and self-critique. The agent splits complex questions into sub-queries, retrieves evidence in parallel via the DAG engine, and validates its own answer before returning.

```javascript
const { AgenticPipeline } = require("@devilsdev/rag-pipeline-utils");
const agent = new AgenticPipeline({
  enableCritique: true,
  enablePlanning: true,
});
const result = await agent.run({
  query: "Compare all three competitors",
  retriever,
  llm,
});
// result.subQueries, result.critique, result.answer
```

### 3-Layer Guardrails

Wrap any pipeline with production safety: **pre-retrieval** (prompt injection detection, topic filtering), **retrieval-time** (relevance threshold, ACL filtering, freshness), and **post-generation** (PII detection, groundedness check, length validation).

```javascript
const { GuardrailsPipeline } = require("@devilsdev/rag-pipeline-utils");
const safePipeline = new GuardrailsPipeline(pipeline, {
  preRetrieval: { enableInjectionDetection: true },
  retrieval: { minRelevanceScore: 0.6 },
  postGeneration: { enablePIIDetection: true, enableGroundednessCheck: true },
});
const result = await safePipeline.run({ query });
```

### Streaming

Stream LLM responses in real-time via Server-Sent Events or WebSocket. The `StreamRouter` auto-detects transport and handles backpressure.

```javascript
const { StreamRouter } = require("@devilsdev/rag-pipeline-utils");
const router = new StreamRouter();

// Express example
app.get("/api/stream", async (req, res) => {
  await router.streamSSE(pipeline, req.query.q, res);
});
```

### Provider Connectors

Seven built-in connectors -- drop into any pipeline with zero configuration:

```javascript
const {
  OpenAIConnector, // GPT-4, GPT-3.5, text-embedding-3
  AnthropicConnector, // Claude 3 Opus, Sonnet, Haiku
  CohereConnector, // Embed + Rerank
  OllamaConnector, // Llama 3, Mistral (local)
  LocalEmbedder, // TF-IDF (offline, no API)
  MemoryRetriever, // In-memory cosine similarity
} = require("@devilsdev/rag-pipeline-utils");

const ollama = new OllamaConnector({
  model: "llama3",
  baseURL: "http://localhost:11434",
});
const openai = new OpenAIConnector({ apiKey: process.env.OPENAI_API_KEY });
```

### Cost Management

Track token spend per provider, estimate costs before execution, and enforce budgets with hard and soft limits.

```javascript
const {
  CostCalculator,
  TokenBudget,
} = require("@devilsdev/rag-pipeline-utils");
const calc = new CostCalculator();
const cost = calc.estimate("gpt-4", 2000, 500);
// cost.totalCost = 0.09 (USD)

const budget = new TokenBudget({ maxTokens: 100000 });
budget.record(2500);
budget.check(1000); // { allowed: true, remaining: { tokens: 96500 } }
```

### Pipeline Debugging

Trace every execution step with timing, bottleneck detection, and optimization recommendations.

```javascript
const {
  ExecutionTracer,
  TraceInspector,
} = require("@devilsdev/rag-pipeline-utils");
const tracer = new ExecutionTracer();
const traced = tracer.trace(pipeline);
const result = await traced.run({ query });

const inspector = new TraceInspector();
const analysis = inspector.analyze(tracer.getTraces()[0]);
// analysis.bottleneck, analysis.recommendations
```

### MCP Integration

Expose any pipeline as a Model Context Protocol tool, callable from Claude Desktop, IDE extensions, or any MCP-compatible client.

```javascript
const { MCPServer } = require("@devilsdev/rag-pipeline-utils");
const server = MCPServer.fromPipeline(pipeline, { name: "knowledge-base" });
const tools = server.getToolDefinitions();
const result = await server.handleToolUse("knowledge-base", {
  query: "How does auth work?",
});
```

### Quick Start Templates

Scaffold complete projects from four built-in templates: `document-qa`, `chatbot`, `code-search`, and `customer-support`.

```javascript
const { ProjectScaffolder } = require("@devilsdev/rag-pipeline-utils");
const scaffolder = new ProjectScaffolder();
scaffolder.create("chatbot", "./my-chatbot");
// Creates: package.json, index.js, .ragrc.json, README.md
```

### Streaming Embeddings

Generate embeddings in real-time with backpressure control and memory management. Process millions of documents without running out of memory.

```javascript
const { StreamingEmbedder } = require("@devilsdev/rag-pipeline-utils");
const streamer = new StreamingEmbedder(myEmbedder, {
  batchSize: 50,
  maxMemoryMB: 512,
});
for await (const { id, vector, progress } of streamer.embedStream(documents)) {
  console.log(`${(progress * 100).toFixed(0)}% — embedded ${id}`);
}
```

### GraphRAG

Build knowledge graphs from documents and retrieve using entity-relationship traversal. Combines graph-based scoring with text matching for superior retrieval on entity-heavy content.

```javascript
const { GraphRetriever } = require("@devilsdev/rag-pipeline-utils");
const retriever = new GraphRetriever({ traversalDepth: 2 });
await retriever.store(documents); // Extracts entities + builds graph
const results = await retriever.retrieve("Who founded OpenAI?", 5);
// Results ranked by entity graph traversal + text relevance
```

### Advanced Reranking

Three reranking strategies beyond LLM-based: BM25 scoring, embedding cosine similarity, and cascaded multi-stage reranking.

```javascript
const {
  ScoringReranker,
  EmbeddingReranker,
  CascadeReranker,
} = require("@devilsdev/rag-pipeline-utils");
const cascade = new CascadeReranker([
  new ScoringReranker(), // Stage 1: BM25 keyword scoring
  new EmbeddingReranker(embedder), // Stage 2: semantic similarity
]);
const ranked = await cascade.rerank(query, documents);
```

### Performance Dashboard

Generate standalone HTML dashboards from pipeline metrics. No external dependencies — open in any browser.

```javascript
const {
  MetricsAggregator,
  DashboardGenerator,
} = require("@devilsdev/rag-pipeline-utils");
const aggregator = new MetricsAggregator();
aggregator.recordQuery({ duration: 250, cost: 0.003, success: true });

const dashboard = new DashboardGenerator();
const html = dashboard.generate(aggregator.getSnapshot());
// Write to file: fs.writeFileSync('dashboard.html', html);
```

### Enterprise

Multi-tenant isolation, SSO integration (SAML, OAuth2, Active Directory, OIDC), compliance-grade audit logging, and data governance with classification and retention policies.

### DAG Workflow Engine

Chain complex multi-step operations with topological execution, retry logic, parallel processing via semaphore-based concurrency, graceful degradation, and checkpoint/resume.

### Security

Defense-in-depth: JWT replay protection, algorithm whitelisting, plugin sandboxing with isolated-vm, multi-layer path traversal defense (5-pass iterative URL decoding), input validation, and automatic secret redaction (36+ patterns).

### Observability

OpenTelemetry distributed tracing, Prometheus metrics export, structured Pino logging, SLO monitoring, and security event tracking.

---

## Installation

```bash
npm install @devilsdev/rag-pipeline-utils
```

### Development

```bash
git clone https://github.com/DevilsDev/rag-pipeline-utils.git
cd rag-pipeline-utils
npm install
npm test          # 92 suites, 2050+ tests
npm run build     # CJS + ESM + TypeScript definitions
npm run lint      # ESLint
npm run dev       # Interactive development tools
```

### Useful Commands

```bash
npm run benchmark         # Performance benchmarks
npm run security:audit    # Dependency scanning
npm run docs:api          # Generate API documentation
npm run docs:validate     # Verify README code examples
npm run verify:esm        # Validate ESM build
```

---

## Roadmap

### v2.4.0 (Current)

- 104 public exports
- Streaming embeddings with backpressure control
- GraphRAG -- knowledge graph construction, entity extraction, graph-based retrieval
- Advanced reranking -- BM25 scoring, embedding-based, cascade rerankers
- Performance dashboard -- HTML dashboard generator, metrics aggregation
- Smart chunking, citation tracking, RAG evaluation, agentic RAG, hybrid retrieval
- 3-layer guardrails, cost management, MCP integration, streaming adapters
- 7 provider connectors (OpenAI, Anthropic, Cohere, Ollama, LocalEmbedder, MemoryRetriever)
- 92 test suites, 2050+ tests

### What's Next (v3.0.0)

- **Intelligent Caching** -- embedding cache with TTL and invalidation strategies
- **Native Rust Bindings** -- performance-critical paths compiled to native code
- **Kubernetes Operator** -- production deployments with auto-scaling
- **Edge Deployment** -- Cloudflare Workers, Deno Deploy, Vercel Edge
- **Real-time Collaboration** -- team-based pipeline editing and sharing

**Vote on features:** [GitHub Discussions](https://github.com/DevilsDev/rag-pipeline-utils/discussions/categories/roadmap)

---

## Contributing

We welcome contributions of all kinds:

- **Code** -- fix bugs, add features, improve performance
- **Documentation** -- write guides, improve examples, clarify concepts
- **Testing** -- expand test coverage, add integration tests, report edge cases
- **Design** -- propose API improvements, suggest architectural patterns
- **Community** -- answer questions, review pull requests, mentor new contributors

**Before you start:**

1. Read the [Contributing Guide](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/docs/CONTRIBUTING.md)
2. Check existing [Issues](https://github.com/DevilsDev/rag-pipeline-utils/issues) and [Discussions](https://github.com/DevilsDev/rag-pipeline-utils/discussions)
3. Open an issue to discuss major changes before coding
4. Follow our [Code of Conduct](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/CODE_OF_CONDUCT.md)

---

## License

**GPL-3.0** -- See [LICENSE](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/LICENSE) for full terms.

---

**Star this repo** if you find it useful. **Share your use case** in [Discussions](https://github.com/DevilsDev/rag-pipeline-utils/discussions/categories/show-and-tell). **Contribute** your first PR -- check [good first issues](https://github.com/DevilsDev/rag-pipeline-utils/labels/good%20first%20issue).
