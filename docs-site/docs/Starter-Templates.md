---
title: Starter templates
description: npm create rag-pipeline scaffolds a working project that answers from your documents and checks its answers, with Next.js and the AI SDK, Mastra, or Cloudflare Workers.
---

# Starter templates

`npm create rag-pipeline` scaffolds a project that answers questions from a folder of documents, cites the passages it used and checks every sentence of the answer against them. Each starter runs before you add an API key, returning the matching passages, so you can try retrieval first.

```bash
npm create rag-pipeline@latest my-app -- --template next
cd my-app
npm install
npm run dev
```

Without `--template`, it asks which starter to use.

| Template  | What you get                                                                                                                                                    | Run it                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `next`    | A Next.js app: a question page and `POST /api/ask`, with any AI SDK model wrapped in `groundingMiddleware` (retrieval before the call, a grounding check after) | `npm run dev`          |
| `mastra`  | A Mastra agent with a `search_documents` tool, a groundedness scorer (no model calls) and guardrails (prompt injection in, PII redaction out)                   | `npm run ask -- "..."` |
| `workers` | A Cloudflare Worker: `GET /ask` as JSON or as a token stream, with citations and a groundedness score, on the library's `/edge` build                           | `npm run dev`          |

All three index the sample documents in memory with the built-in TF-IDF embedder, so there is no database and no embedding API to set up. Replace the documents (`docs/` in `next` and `mastra`, `src/docs.js` in `workers`) with your own.

## Add a model

Copy the example file and set `ANTHROPIC_API_KEY`:

| Template  | Copy                | To           | Model setting                                          |
| --------- | ------------------- | ------------ | ------------------------------------------------------ |
| `next`    | `.env.example`      | `.env.local` | `ANTHROPIC_MODEL`, or any AI SDK provider              |
| `mastra`  | `.env.example`      | `.env`       | `MODEL`, any Mastra model (`anthropic/...`)            |
| `workers` | `.dev.vars.example` | `.dev.vars`  | `ANTHROPIC_MODEL`; `ANTHROPIC_BASE_URL` for AI Gateway |

The example files are copied, the files with keys are in `.gitignore`.

## What the answer looks like

From the `next` starter, with a key:

```json
{
  "answer": "Full-time employees receive twenty days of paid vacation per year. Unused days carry over until the end of March.",
  "sources": [{ "id": "vacation", "source": "vacation.md" }],
  "grounding": { "grounded": true, "groundedness": 1, "unsupported": [] }
}
```

When a sentence isn't supported by any passage, `grounded` is `false` and `unsupported` lists it. The check is lexical (see [Evaluation](./Evaluation#known-limitations)): a correct paraphrase can be reported unsupported, and the optional [LLM judge](./Evaluation#paraphrases-the-optional-llm-judge) can rule on those sentences.

## Next steps

- **More documents:** replace `MemoryRetriever` with `QdrantRetriever` or `PgVectorRetriever`, and `LocalEmbedder` with an embedding model ([Connectors](./Concepts-Connectors)).
- **Test the answers in CI:** `rag-pipeline eval` scores a test set and fails the build when answers regress ([CLI](./CLI#eval)).
- **Deploy:** Vercel for `next` (the documents are included with the route that reads them), `node .mastra/output/index.mjs` or a Mastra deployer for `mastra`, `npm run deploy` for `workers`.

## How the starters are tested

Every change to the library runs `npm run test:templates` in CI: each starter is scaffolded, installed with that build of the library, built (`next build`, `tsc` and `mastra build`, `wrangler deploy --dry-run`) and asked a question without a key. Before a release, the same script runs with a Claude key and checks that each answer is grounded.
