# create-rag-pipeline

Starter projects for [`@devilsdev/rag-pipeline-utils`](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils): an app that answers questions from a folder of documents, cites the passages it used and checks every sentence of the answer against them.

```bash
npm create rag-pipeline@latest my-app -- --template next
cd my-app
npm install
npm run dev
```

| Template  | What you get                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| `next`    | Next.js and the AI SDK: a question page and `POST /api/ask`, with the model wrapped in `groundingMiddleware` |
| `mastra`  | A Mastra agent with a `search_documents` tool, a groundedness scorer and guardrails                          |
| `workers` | A Cloudflare Worker: `GET /ask` as JSON or a token stream, with citations and a groundedness score           |

Without `--template`, it asks. Each starter runs before you add an API key, returning the matching passages; copy its `.env.example` (`.dev.vars.example` for Workers) and set `ANTHROPIC_API_KEY` to get answers from Claude.

The starters ask for the library version this package was released with. Node.js 22 or later.

[Documentation](https://devilsdev.github.io/rag-pipeline-utils/docs/Starter-Templates) · [Source](https://github.com/DevilsDev/rag-pipeline-utils/tree/main/packages/create-rag-pipeline) · MIT
