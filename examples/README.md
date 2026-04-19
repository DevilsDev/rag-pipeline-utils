# Examples

End-to-end runnable examples that demonstrate
`@devilsdev/rag-pipeline-utils` in real deployment shapes.

| Example                                   | Stack                                    | What it shows                                                                                                                                    |
| ----------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`fastify-rag-demo/`](./fastify-rag-demo) | Fastify 5 + OpenAI + in-memory retriever | Minimal RAG service with citations, evaluation, and 3-layer guardrails. Ships with Dockerfile + Fly.io + Railway configs for one-command deploy. |

Each example is **self-contained** — its own `package.json`, its own
`README.md`, its own deploy story. Pick the one closest to your stack
and use it as a starting point.

## Running an example

```bash
cd examples/<example-name>
cp .env.example .env       # configure your provider keys
npm install
npm start
```

Smoke test it:

```bash
node scripts/smoke.js
```

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
