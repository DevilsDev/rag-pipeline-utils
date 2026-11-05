# RAG on Cloudflare Workers

A Cloudflare Worker that answers questions from your documents, made with [`create-rag-pipeline`](https://devilsdev.github.io/rag-pipeline-utils/docs/Starter-Templates): retrieval in memory with the built-in TF-IDF embedder, answers from Claude with citations and a groundedness score, and streaming. It uses `@devilsdev/rag-pipeline-utils/edge`, the library's build for runtimes with Web APIs only.

## Run it

```bash
npm install
npm run dev
```

In another terminal:

```bash
curl "http://localhost:8787/ask?q=How+many+vacation+days+do+I+get%3F"
```

Without an API key the Worker returns the matching passages (`answer: null`). To get answers from Claude:

```bash
cp .dev.vars.example .dev.vars   # then set ANTHROPIC_API_KEY
```

Stream the answer as server-sent events:

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

## Make it yours

- **Your documents:** `src/docs.js` holds them. Workers have no disk to read at runtime, so they're bundled with the code: replace them, or generate the file at build time.
- **More documents:** `QdrantRetriever` works in Workers; index your documents there and give the pipeline an embedder.
- **Settings:** `ANTHROPIC_MODEL` chooses the model; `ANTHROPIC_BASE_URL` sends requests through a gateway such as Cloudflare AI Gateway. Set them under `[vars]` in `wrangler.toml`.
