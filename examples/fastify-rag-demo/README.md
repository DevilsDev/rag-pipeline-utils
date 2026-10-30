# Fastify RAG demo

Minimal end-to-end RAG service built on
[`@devilsdev/rag-pipeline-utils`](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils)
and [Fastify 5](https://fastify.dev/).

What you get in one short `server.js`:

- `POST /ingest` — embed and index a document
- `POST /query` — RAG query with **citations**, **groundedness score**, and **evaluation metrics** in the response
- `GET /health` — liveness check (reports the mode and the number of indexed documents)
- 3-layer guardrails in strict mode (prompt-injection blocking, relevance filtering, PII and groundedness checks)
- Request cancellation: a client disconnect aborts the pipeline through `options.signal`
- CORS + per-IP rate limiting
- Docker image, Fly.io config, Railway config

Requires Node.js 22 or higher.

## Run locally

### With OpenAI

```bash
cd examples/fastify-rag-demo
npm install
OPENAI_API_KEY=sk-... npm start
```

PowerShell: `$env:OPENAI_API_KEY="sk-..."; npm start`

`OpenAIConnector` embeds documents and queries (`text-embedding-3-small`)
and generates answers (`OPENAI_MODEL`, default `gpt-4o-mini`).

### Offline mode (no API key, no network)

```bash
npm run start:offline        # same as: RAG_OFFLINE=1 npm start
```

Offline mode uses the built-in `LocalEmbedder` (TF-IDF, retrained on every
ingest) and an extractive stub llm that answers with the first sentence of
the best matching document. Use it to try the API, the guardrails and the
scripts; retrieval is lexical and answers are copied, not generated.

### Smoke test

With the server running, in another terminal:

```bash
npm run smoke        # or: SERVER=http://localhost:3000 node scripts/smoke.js
```

It ingests two documents, runs a query (asserting retrieved documents,
citations and evaluation scores), and checks that a prompt-injection query
is blocked with 422. Offline mode output:

```
▸ GET /health ... ✓
▸ POST /ingest policy-vacation ... ✓
▸ POST /ingest policy-remote ... ✓
▸ POST /query (vacation policy) ... ✓
▸ POST /query (prompt injection is blocked) ... ✓

--- Result ---
Mode:              offline
Answer:            Vacation policy: full-time employees accrue 15 days of paid time off per year, increasing to 20 days after three years of service.
Groundedness:      1.00
Citations:         1
Faithfulness:      1.00
Relevance:         0.43
Retrieved chunks:  1
```

The index is in memory: restarting the server empties it.

## Environment variables

| Variable              | Default            | Purpose                                                        |
| --------------------- | ------------------ | -------------------------------------------------------------- |
| `OPENAI_API_KEY`      | none               | Required unless offline; calls fail with `MISSING_API_KEY`     |
| `OPENAI_MODEL`        | `gpt-4o-mini`      | Chat model                                                     |
| `RAG_OFFLINE`         | off                | `1` or `true` for offline mode (or `node server.js --offline`) |
| `MIN_RELEVANCE_SCORE` | `0.2`              | Retrieval guard: drop documents scoring below this             |
| `QUERY_TIMEOUT_MS`    | `30000`            | Per-query pipeline timeout                                     |
| `PORT` / `HOST`       | `3000` / `0.0.0.0` | Listen address                                                 |
| `RATE_LIMIT_MAX`      | `60`               | Requests per minute per IP                                     |
| `LOG_LEVEL`           | `info`             | Fastify log level                                              |

The server does not read a `.env` file; set variables in your shell or
deploy platform.

## API

```bash
curl -X POST localhost:3000/ingest -H 'content-type: application/json' \
  -d '{"id":"doc-1","text":"Our office is closed on public holidays.","metadata":{"topic":"hr"}}'

curl -X POST localhost:3000/query -H 'content-type: application/json' \
  -d '{"query":"When is the office closed?"}'
```

`POST /query` responses:

- `200` `{ answer, citations, groundednessScore, evaluation, retrievedCount, filteredOut }`
  (`citations` is a list of `{ sentence, sources: [{ docId, score }] }`)
- `422` `{ blocked: true, reason, issues }` when a guardrail blocks the query
  or the answer (prompt injection, PII in the answer, groundedness below 0.3)
- `502` `{ error }` when the pipeline fails (missing key, provider error,
  timeout)

## Bulk-ingest a directory

```bash
node scripts/ingest.js ./your-docs
SERVER=http://localhost:3000 node scripts/ingest.js ./your-docs
```

Walks `your-docs/` recursively and indexes every `.txt` / `.md` / `.mdx`
file via `POST /ingest`, using its relative path as the id. Works in both
modes; exits 1 if any file fails.

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

The image installs dependencies with `npm install --omit=dev` because no
lockfile is committed; commit a `package-lock.json` and switch to `npm ci`
for reproducible builds.

## Architecture

```
HTTP request
   │
   ▼
Fastify route (validation, rate limit, AbortController)
   │
   ▼
GuardrailsPipeline (strict) ── pre-retrieval: injection detection, length cap
   │
   ├─── createRagPipeline
   │       ├── embedder:  OpenAIConnector   (offline: LocalEmbedder)
   │       ├── retriever: MemoryRetriever   (in-process cosine similarity)
   │       ├── retrieval guard: relevance filter, before generation
   │       └── llm:       OpenAIConnector   (offline: extractive stub)
   │
   └─── post-generation: PII detection, groundedness threshold
   │
   ▼
JSON response { answer, citations, groundednessScore, evaluation, retrievedCount }
```

The building blocks from `@devilsdev/rag-pipeline-utils`:
`createRagPipeline`, `MemoryRetriever`, `OpenAIConnector` (or
`LocalEmbedder`), plus `GuardrailsPipeline` for safety. Everything else is
Fastify.

## Going to production

This demo is intentionally minimal. For a real production deployment
you'd swap:

- `MemoryRetriever` → managed vector store (Pinecone, Weaviate, pgvector)
  for persistence and scale (see [`../openai-pinecone`](../openai-pinecone)
  for a Pinecone retriever adapter)
- Whole-document ingest → chunk documents before embedding
- Add an embedding cache for repeated texts
- Add structured logs → already on by default; ship to your
  observability stack

See the framework docs for guides on each:

- [Architecture](https://devilsdev.github.io/rag-pipeline-utils/docs/Architecture)
- [Performance](https://devilsdev.github.io/rag-pipeline-utils/docs/Performance)
- [Security](https://devilsdev.github.io/rag-pipeline-utils/docs/Security)
- [Deployment guides](https://devilsdev.github.io/rag-pipeline-utils/docs/Deployment-Docker)

## License

MIT (matches the parent framework).
