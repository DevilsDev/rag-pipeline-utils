# @devilsdev/rag-core

createRagPipeline and its building blocks: retrieval, reranking, caching, cost tracking and model routing.

Part of [@devilsdev/rag-pipeline-utils](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils), split into packages so you install only what you use. The objects are the same ones the full package exports; versions move in lockstep.

```bash
npm install @devilsdev/rag-core
```

Exports: `createRagPipeline`, `createPipeline`, `packContext`, `createError`, `wrapError`, `ERROR_CODES`, `retry`, `withRetry`, `ChunkingEngine`, `BM25Search`, `reciprocalRankFusion`, `HybridRetriever`, `ScoringReranker`, `EmbeddingReranker`, `CascadeReranker`, `MemoryCache`, `RedisCache`, `CostCalculator`, `PRICING_METADATA`, `CostTracker`, `TokenBudget`, `createModelRouter`, `classifyQuery`, `MemoryRetriever`, `BaseConnector`.

Documentation: https://devilsdev.github.io/rag-pipeline-utils/

The other packages:

- [`@devilsdev/rag-connectors`](https://www.npmjs.com/package/@devilsdev/rag-connectors)
- [`@devilsdev/rag-eval`](https://www.npmjs.com/package/@devilsdev/rag-eval)
- [`@devilsdev/rag-guardrails`](https://www.npmjs.com/package/@devilsdev/rag-guardrails)
