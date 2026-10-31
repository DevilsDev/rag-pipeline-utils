# RAG on Cloudflare Workers

A Cloudflare Worker that answers questions from your documents with `@devilsdev/rag-pipeline-utils`: retrieval in memory with the built-in TF-IDF embedder, answers from Claude, citations, and streaming with time to first token.

> Needs `@devilsdev/rag-pipeline-utils` 3.2.0 or later, which is coming soon.

## Run it

```bash
npm install
npm run dev
```

Then, in another terminal:

```bash
curl "http://localhost:8787/ask?q=How+many+vacation+days+do+I+get%3F"
```

Without an API key the Worker returns the matching passages (`answer: null`). To generate answers with Claude, put the key in `.dev.vars`, which Wrangler reads in development:

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > .dev.vars
```

Stream the answer as server-sent events, token by token:

```bash
curl -N "http://localhost:8787/ask?q=How+many+vacation+days+do+I+get%3F&stream=1"
```

```
event: token
data: "Full-time employees receive "
...
event: done
data: {"groundedness":1,"timing":{"firstTokenMs":412,"totalMs":980}}
```

## Deploy

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npm run deploy
```

## API

| Request                   | Response                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `GET /ask?q=...`          | `{ answer, sources: [{ id, source, score }], groundedness, timing }`                                        |
| `GET /ask?q=...&stream=1` | Server-sent events: `token` events, then `done` with `groundedness` and `timing: { firstTokenMs, totalMs }` |

A missing `q` is a `400`; a failed run (for example, a provider error or the 30-second timeout) is a `502` with `{ error }`.

## How it works

- `wrangler.toml` turns on the `nodejs_compat` flag, which the library needs.
- `src/docs.js` holds the documents. Workers have no disk to read them from at runtime, so they are bundled with the code. The first request in each isolate trains `LocalEmbedder` on them and indexes them in a `MemoryRetriever`.
- `src/worker.js` builds a `createRagPipeline` per request with an `AnthropicConnector` when `ANTHROPIC_API_KEY` is set. Set `ANTHROPIC_MODEL` in `[vars]` to choose the model.

For a larger or changing document set, keep the index in [Qdrant](https://qdrant.tech) and use `QdrantRetriever`, which works on Workers over HTTP, with an embedding API instead of `LocalEmbedder`.

See [Cloudflare Workers](https://devilsdev.github.io/rag-pipeline-utils/docs/Deployment-Cloudflare-Workers) in the docs for what works on Workers and what doesn't. The repository's CI runs this Worker in workerd on every change ([`test/edge`](../../test/edge)).
