# Examples

Runnable examples for `@devilsdev/rag-pipeline-utils` 3.x. Each needs Node.js 22 or later (the Cloudflare Worker runs in Workers, built with Node.js).

| Example                                     | Stack                                    | What it shows                                                                                                                                       | Offline mode                |
| ------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| [`basic-pipeline/`](./basic-pipeline)       | Built-ins only                           | `createRagPipeline` with `LocalEmbedder` + `MemoryRetriever`, a custom LLM plugin, citations/evaluation, retrieval-only runs, `AbortSignal` cancel. | Always offline              |
| [`openai-pinecone/`](./openai-pinecone)     | OpenAI + Pinecone                        | `OpenAIConnector` as embedder and llm, a Pinecone retriever adapter, citations and evaluation.                                                      | `npm run mock`              |
| [`fastify-rag-demo/`](./fastify-rag-demo)   | Fastify 5 + OpenAI + in-memory retriever | HTTP RAG service with citations, evaluation, strict guardrails and request cancellation. Ships with Dockerfile + Fly.io + Railway configs.          | `npm run start:offline`     |
| [`mcp-server/`](./mcp-server)               | MCP SDK + built-ins                      | An MCP server whose `search_documents` tool lets Claude and other MCP clients search your indexed documents and cite them.                          | Always offline              |
| [`cloudflare-worker/`](./cloudflare-worker) | Cloudflare Workers + Claude              | A Worker that answers from bundled documents as JSON or server-sent events, with citations and time to first token. Needs 3.2.0.                    | Passages only without a key |

Each example is **self-contained**: its own `package.json`, its own
`README.md` with run instructions. Pick the one closest to your stack and
use it as a starting point.

## Run one in your browser

Each example opens on StackBlitz, which installs it and runs its offline mode. Nothing to install, no API keys needed:

- [basic-pipeline](https://stackblitz.com/github/DevilsDev/rag-pipeline-utils/tree/main/examples/basic-pipeline)
- [openai-pinecone](https://stackblitz.com/github/DevilsDev/rag-pipeline-utils/tree/main/examples/openai-pinecone) (runs `npm run mock`)
- [fastify-rag-demo](https://stackblitz.com/github/DevilsDev/rag-pipeline-utils/tree/main/examples/fastify-rag-demo) (runs `npm run start:offline`)

If StackBlitz stays on "Cloning repo from GitHub" for more than a minute, reload the page.

## Running an example

```bash
cd examples/<example-name>
npm install
npm start
```

Then follow the example's README for API keys and extras:

- `basic-pipeline`: nothing else needed.
- `openai-pinecone`: `cp .env.example .env` and fill in `OPENAI_API_KEY`
  and `PINECONE_API_KEY`, or run `npm run mock` without keys.
- `fastify-rag-demo`: set `OPENAI_API_KEY` in the environment (or use
  `npm run start:offline`), then run `npm run smoke` in another terminal.
- `mcp-server`: run `npm run ingest` and `npm test`, then connect it to
  Claude Code or Claude Desktop as its README shows.

## The 2.5 API in brief

```javascript
const pipeline = createRagPipeline({
  loader,
  embedder,
  retriever,
  llm,
  reranker,
});

const result = await pipeline.run({
  query: "What is RAG?",
  options: { topK: 3, citations: true, evaluate: true, signal, timeout: 30000 },
});
// { success, query, results, answer, citations?, evaluation? }
// answer is null when no llm is configured
// failures resolve { success: false, error } (e.g. "Execution aborted")
```

A vector retriever such as `MemoryRetriever` needs an `embedder` (or a
`queryVector` passed to `run()`).

## Suggesting a new example

Open a [discussion](https://github.com/DevilsDev/rag-pipeline-utils/discussions)
with the proposed stack and use case. We're especially interested in:

- **Next.js** (App Router + edge runtime)
- **Hono** for Cloudflare Workers
- **AWS Lambda** with a managed vector store
- **MCP server** (Claude Desktop / Cursor / Zed integration)

A good example is small enough to read in 10 minutes, deployable in
one command, and demonstrates a real production pattern (not just a
"hello world").
