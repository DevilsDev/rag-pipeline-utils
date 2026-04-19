# Fastify RAG demo

Minimal end-to-end RAG service built on
[`@devilsdev/rag-pipeline-utils`](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils)

- [Fastify 5](https://fastify.dev/).

What you get in ~150 lines of `server.js`:

- `POST /ingest` — index a document
- `POST /query` — RAG query with **citations**, **groundedness score**, and **evaluation metrics** in the response
- `GET /health` — liveness check
- 3-layer guardrails wired (prompt-injection detection, relevance gating, PII detection)
- CORS + per-IP rate limiting
- Docker image, Fly.io config, Railway config — deploy in one command

## Run locally

```bash
cd examples/fastify-rag-demo
cp .env.example .env          # edit OPENAI_API_KEY
npm install
npm start
```

Then in another terminal:

```bash
# Ingest two example documents and run a query end-to-end
node scripts/smoke.js
```

You should see something like:

```
▸ GET /health ... ✓
▸ POST /ingest policy-vacation ... ✓
▸ POST /ingest policy-remote ... ✓
▸ POST /query (vacation policy) ... ✓

--- Result ---
Answer:           Full-time employees accrue 15 days of paid time off per year...
Groundedness:     0.91
Citations:        2
Faithfulness:     0.94
Relevance:        0.89
Retrieved chunks: 2
```

## Bulk-ingest a directory

```bash
node scripts/ingest.js ./your-docs
```

Walks `your-docs/` recursively, indexes every `.txt` / `.md` / `.mdx`
file via `POST /ingest`.

## Deploy

### Fly.io

```bash
fly launch --copy-config --no-deploy
fly secrets set OPENAI_API_KEY=sk-...
fly deploy
```

The included `fly.toml` configures:

- Auto-start / auto-stop for cost (machine sleeps when idle)
- HTTPS-only with auto-managed certs
- `/health` health checks
- 512 MB shared CPU instance

### Railway

```bash
railway link
railway variables set OPENAI_API_KEY=sk-...
railway up
```

The included `railway.json` configures the Dockerfile build and
health-check path.

### Render / DigitalOcean App Platform / any Docker host

```bash
docker build -t rag-demo .
docker run -p 3000:3000 -e OPENAI_API_KEY=sk-... rag-demo
```

## Architecture

```
HTTP request
   │
   ▼
Fastify route (validation, rate limit)
   │
   ▼
GuardrailsPipeline ──── pre-retrieval: injection detection, length cap
   │
   ├─── Pipeline (rag-core)
   │       ├── retriever: MemoryRetriever (in-process cosine similarity)
   │       └── llm:       OpenAIConnector
   │
   └─── post-generation: PII detection, groundedness threshold
   │
   ▼
JSON response { answer, citations, groundednessScore, evaluation, retrievedCount }
```

The whole thing is **three primitives** from `@devilsdev/rag-pipeline-utils`:
`createRagPipeline`, `MemoryRetriever`, `OpenAIConnector` — plus
`GuardrailsPipeline` for safety. Everything else is Fastify.

## Going to production

This demo is intentionally minimal. For a real production deployment
you'd swap:

- `MemoryRetriever` → managed vector store (Pinecone, Weaviate, pgvector)
  for persistence and scale
- The default chunker → `recursive` or `semantic` strategy with your
  document types
- The `MemoryRetriever`'s in-process state → durable storage (Redis,
  Postgres) so restarts don't lose your index
- Add an embedding cache → `EmbeddingCache` from the framework, backed
  by Redis
- Add structured logs → already on by default; ship to your
  observability stack

See the framework docs for guides on each:

- [Architecture](https://devilsdev.github.io/rag-pipeline-utils/docs/Architecture)
- [Performance](https://devilsdev.github.io/rag-pipeline-utils/docs/Performance)
- [Security](https://devilsdev.github.io/rag-pipeline-utils/docs/Security)
- [Deployment guides](https://devilsdev.github.io/rag-pipeline-utils/docs/Deployment-Docker)

## License

MIT (matches the parent framework).
