---
slug: reducing-retrieval-latency-case-study
title: "Case Study: Reducing Retrieval Latency by 60%"
authors: [ali]
tags: [performance, case-study, optimization, production]
date: "2025-11-12"
---

How we transformed a slow, costly RAG system into a high-performance production service by optimizing every layer of the stack. This case study shares specific techniques, measurements, and code that reduced P95 latency from 2000ms to 800ms.

<!--truncate-->

## The Challenge

**Company**: Mid-sized SaaS platform serving 50,000 users
**Use Case**: Technical documentation Q&A system
**Initial Performance**: P95 latency of 2000ms, 50 queries/second max throughput
**Goal**: Sub-1000ms P95 latency, 200+ qps throughput

### Initial Architecture

```
User Query → API Gateway → RAG Service → Embedder (OpenAI API)
                                      ↓
                                 Vector DB (Pinecone)
                                      ↓
                                 LLM (GPT-4)
```

**Pain Points**:

- Embedding generation: 200-300ms per query
- Vector search: 150-250ms with frequent timeouts
- High API costs: $5000/month for embeddings alone
- No caching strategy
- Sequential processing of pipeline stages

## Phase 1: Profiling (Week 1)

### Instrumentation

Added detailed latency tracking:

```javascript
const { performance } = require("perf_hooks");

class LatencyTracker {
  constructor() {
    this.spans = new Map();
  }

  start(spanId) {
    this.spans.set(spanId, {
      start: performance.now(),
      checkpoints: [],
    });
  }

  checkpoint(spanId, label) {
    const span = this.spans.get(spanId);
    if (!span) return;

    span.checkpoints.push({
      label,
      elapsed: performance.now() - span.start,
    });
  }

  finish(spanId) {
    const span = this.spans.get(spanId);
    if (!span) return null;

    const total = performance.now() - span.start;
    this.spans.delete(spanId);

    return {
      total,
      breakdown: span.checkpoints,
    };
  }
}

// Usage in pipeline
async function query(text) {
  const tracker = new LatencyTracker();
  tracker.start("query");

  const embedding = await embedder.embed(text);
  tracker.checkpoint("query", "embedding");

  const docs = await retriever.retrieve(embedding);
  tracker.checkpoint("query", "retrieval");

  const response = await llm.generate(text, docs);
  tracker.checkpoint("query", "generation");

  const metrics = tracker.finish("query");
  logger.info("Query completed", metrics);

  return response;
}
```

### Baseline Measurements

```
Total P95: 2000ms
├─ Embedding: 280ms (14%)
├─ Retrieval: 220ms (11%)
├─ Generation: 1450ms (72.5%)
└─ Overhead: 50ms (2.5%)
```

**Key Finding**: LLM generation dominated latency, but embedding and retrieval had optimization opportunities.

## Phase 2: Embedding Optimization (Week 2-3)

### Solution 1: Local Embedder with Caching

Replaced OpenAI API with local model:

```javascript
const { SentenceTransformerEmbedder } = require("./embedders");
const NodeCache = require("node-cache");

class CachedEmbedder {
  constructor() {
    // Use lightweight local model
    this.embedder = new SentenceTransformerEmbedder({
      modelName: "sentence-transformers/all-MiniLM-L6-v2",
      device: "cpu",
    });

    // L1 cache: 10,000 most recent queries
    this.cache = new NodeCache({
      stdTTL: 3600, // 1 hour
      maxKeys: 10000,
      useClones: false, // Store references for speed
    });

    this.hits = 0;
    this.misses = 0;
  }

  async embed(text) {
    const key = this.hash(text);
    const cached = this.cache.get(key);

    if (cached) {
      this.hits++;
      return cached;
    }

    this.misses++;
    const embedding = await this.embedder.embed(text);
    this.cache.set(key, embedding);

    return embedding;
  }

  hash(text) {
    return require("crypto")
      .createHash("md5")
      .update(text.toLowerCase().trim())
      .digest("hex");
  }

  getStats() {
    const total = this.hits + this.misses;
    return {
      hitRate: total > 0 ? this.hits / total : 0,
      hits: this.hits,
      misses: this.misses,
    };
  }
}
```

**Results**:

- Cache hit rate: 45% after warm-up
- Cached queries: 0.1ms (99.96% improvement)
- Cache misses: 80ms (71% improvement over API)
- Monthly cost savings: $4,500

### Solution 2: Batch Processing

For bulk operations, implemented batching:

```javascript
class BatchEmbedder {
  constructor(baseEmbedder, batchSize = 32) {
    this.baseEmbedder = baseEmbedder;
    this.batchSize = batchSize;
    this.queue = [];
    this.processing = false;
  }

  async embed(text) {
    return new Promise((resolve, reject) => {
      this.queue.push({ text, resolve, reject });

      if (!this.processing) {
        setImmediate(() => this.processBatch());
      }
    });
  }

  async processBatch() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.batchSize);
      const texts = batch.map((item) => item.text);

      try {
        const embeddings = await this.baseEmbedder.embedBatch(texts);

        batch.forEach((item, i) => {
          item.resolve(embeddings[i]);
        });
      } catch (error) {
        batch.forEach((item) => item.reject(error));
      }
    }

    this.processing = false;
  }
}
```

**Results** (bulk ingestion):

- 10x throughput improvement
- GPU utilization: 15% → 85%

## Phase 3: Retrieval Optimization (Week 4-5)

### Solution 1: HNSW Indexing

Migrated from flat index to HNSW:

```python
# Vector DB migration (Qdrant)
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, HnswConfig

client = QdrantClient(url="http://localhost:6333")

client.recreate_collection(
    collection_name="docs",
    vectors_config=VectorParams(
        size=384,  # MiniLM embedding dimension
        distance=Distance.COSINE,
        hnsw_config=HnswConfig(
            m=16,                # Connections per layer
            ef_construct=100,    # Candidates during construction
            full_scan_threshold=10000
        )
    ),
    optimizers_config={
        "indexing_threshold": 20000
    }
)
```

**Parameters Tuned**:

- `m=16`: Balances accuracy and speed
- `ef_construct=100`: Higher quality index
- `ef_search=50`: Runtime search parameter

**Results**:

- Search latency: 220ms → 45ms (80% improvement)
- Recall@10: 98.5% (acceptable trade-off)
- Index build time: 2 hours for 1M vectors

### Solution 2: Query Preprocessing

Implemented query optimization:

```javascript
class QueryOptimizer {
  constructor() {
    this.stopWords = new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
    ]);
  }

  optimize(query) {
    // Remove stop words
    let optimized = query
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => !this.stopWords.has(word))
      .join(" ");

    // Truncate to max useful length
    if (optimized.length > 200) {
      optimized = optimized.substring(0, 200);
    }

    // Normalize whitespace
    optimized = optimized.replace(/\s+/g, " ").trim();

    return optimized;
  }
}
```

**Results**:

- 15% faster embedding generation
- 8% improvement in retrieval relevance

## Phase 4: Parallel Processing (Week 6)

### Solution: Pipeline Parallelization

Identified independent operations:

```javascript
class OptimizedPipeline {
  async query(text) {
    const tracker = new LatencyTracker();
    tracker.start("query");

    // Step 1: Parallel preprocessing
    const [embedding, systemPrompt] = await Promise.all([
      this.embedder.embed(text),
      this.loadSystemPrompt(), // Can be done concurrently
    ]);
    tracker.checkpoint("query", "parallel-prep");

    // Step 2: Retrieval
    const docs = await this.retriever.retrieve(embedding, { topK: 5 });
    tracker.checkpoint("query", "retrieval");

    // Step 3: Parallel context building and metadata fetch
    const [context, metadata] = await Promise.all([
      this.buildContext(docs),
      this.fetchMetadata(docs.map((d) => d.id)),
    ]);
    tracker.checkpoint("query", "parallel-context");

    // Step 4: Generation
    const response = await this.llm.generate({
      query: text,
      context,
      systemPrompt,
    });
    tracker.checkpoint("query", "generation");

    const metrics = tracker.finish("query");
    return { response, metrics, metadata };
  }

  async buildContext(docs) {
    // Rerank in parallel with formatting
    const [reranked, formatted] = await Promise.all([
      this.reranker.rerank(docs),
      Promise.all(docs.map((d) => this.formatDocument(d))),
    ]);

    return formatted.join("\n\n");
  }
}
```

**Results**:

- Reduced overhead: 50ms → 15ms (70% improvement)
- Better resource utilization

## Phase 5: LLM Optimization (Week 7-8)

### Solution 1: Streaming Responses

Implemented token streaming for better perceived performance:

```javascript
async function* queryStream(text) {
  const embedding = await embedder.embed(text);
  const docs = await retriever.retrieve(embedding);

  // Stream tokens as they're generated
  for await (const token of llm.generateStream(text, docs)) {
    yield token;
  }
}

// Express endpoint
app.post("/api/query/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    for await (const token of queryStream(req.body.query)) {
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
    }
    res.write("data: [DONE]\n\n");
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
  } finally {
    res.end();
  }
});
```

**Results**:

- Time to first token: 400ms (perceived latency improvement)
- User satisfaction: +25% (from user surveys)

### Solution 2: Model Selection

Switched from GPT-4 to GPT-3.5-Turbo for most queries:

```javascript
class AdaptiveModelSelector {
  selectModel(query, complexity) {
    // Use GPT-4 only for complex queries
    if (complexity.score > 0.7 || query.length > 500) {
      return {
        model: "gpt-4",
        maxTokens: 1000,
      };
    }

    // Use GPT-3.5-Turbo for simple queries
    return {
      model: "gpt-3.5-turbo",
      maxTokens: 500,
    };
  }

  analyzeComplexity(query) {
    // Simple heuristic
    const factors = {
      length: query.length / 1000,
      questionWords: (query.match(/\b(how|why|explain|compare)\b/gi) || [])
        .length,
      technicalTerms: (
        query.match(/\b(algorithm|architecture|implementation)\b/gi) || []
      ).length,
    };

    const score =
      factors.length * 0.3 +
      factors.questionWords * 0.4 +
      factors.technicalTerms * 0.3;

    return { score, factors };
  }
}
```

**Results**:

- Average generation latency: 1450ms → 650ms (55% improvement)
- 90% of queries handled by GPT-3.5-Turbo
- Monthly cost savings: $2,000

## Final Architecture

```
User Query → API Gateway → Load Balancer
                                ↓
                    ┌───────────────────────┐
                    │   RAG Service Cluster │
                    │   (3 instances)       │
                    └───────────────────────┘
                                ↓
          ┌─────────────────────┼─────────────────────┐
          ↓                     ↓                     ↓
    Local Embedder         HNSW Index           LLM Router
    (with cache)          (Qdrant)          (GPT-3.5/GPT-4)
```

## Final Results

| Metric             | Before | After   | Improvement |
| ------------------ | ------ | ------- | ----------- |
| **P50 Latency**    | 1200ms | 400ms   | 67%         |
| **P95 Latency**    | 2000ms | 800ms   | 60%         |
| **P99 Latency**    | 3500ms | 1200ms  | 66%         |
| **Throughput**     | 50 qps | 250 qps | 5x          |
| **Cache Hit Rate** | 0%     | 45%     | -           |
| **Monthly Cost**   | $7,500 | $1,800  | 76%         |
| **Uptime**         | 99.5%  | 99.9%   | +0.4%       |

### Latency Breakdown (After)

```
Total P95: 800ms
├─ Embedding: 35ms (4.4%) - 88% improvement
├─ Retrieval: 45ms (5.6%) - 80% improvement
├─ Generation: 650ms (81.2%) - 55% improvement
└─ Overhead: 70ms (8.8%) - improved parallelization
```

## Key Takeaways

1. **Profile First**: Don't optimize blindly - measure everything
2. **Low-Hanging Fruit**: Caching provided immediate 45% hit rate
3. **Batch When Possible**: 10x throughput for bulk operations
4. **HNSW Is Worth It**: 80% faster retrieval with minimal accuracy loss
5. **Parallel Everything**: Identify and execute independent operations concurrently
6. **Right Tool for the Job**: Not every query needs GPT-4
7. **Stream for UX**: Perceived performance matters as much as actual latency
8. **Monitor Continuously**: Set up dashboards to track regressions

## Tools Used

- **Profiling**: Node.js `perf_hooks`, custom latency tracker
- **Caching**: `node-cache` for L1, Redis for L2 (optional)
- **Vector DB**: Qdrant with HNSW indexing
- **Embeddings**: Sentence Transformers (all-MiniLM-L6-v2)
- **LLMs**: OpenAI GPT-3.5-Turbo / GPT-4
- **Monitoring**: Prometheus + Grafana
- **Load Testing**: k6, Apache JMeter

## Code Repository

Full implementation available in the RAG Pipeline Utils examples:

- [Cached Embedder Example](/docs/Examples)
- [Performance Monitoring](/docs/Observability)
- [Deployment Guides](/docs/Deployment-Docker)

## Further Reading

- [Performance Tuning Guide](/blog/rag-pipeline-performance-tuning)
- [Building Custom Embedders](/blog/building-custom-embedders-deep-dive)
- [Production Security](/blog/securing-production-rag-systems)
