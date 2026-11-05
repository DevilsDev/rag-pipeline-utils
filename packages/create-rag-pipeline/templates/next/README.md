# Ask your documents (Next.js + AI SDK)

A Next.js app that answers questions from the Markdown files in `docs/`, made with [`create-rag-pipeline`](https://devilsdev.github.io/rag-pipeline-utils/docs/Starter-Templates). The AI SDK model is wrapped with `groundingMiddleware` from [`@devilsdev/rag-pipeline-utils`](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils): before each call it retrieves the matching passages and gives them to the model; after the call it checks every sentence of the answer against them and returns the report with the sources.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 and ask "How many vacation days do I get?". Without an API key the app shows the matching passages. To get answers from Claude:

```bash
cp .env.example .env.local   # then set ANTHROPIC_API_KEY
```

Or call the API:

```bash
curl -X POST localhost:3000/api/ask -H "content-type: application/json" \
  -d '{"question":"How many vacation days do I get?"}'
```

```json
{
  "answer": "Full-time employees receive twenty days of paid vacation per year…",
  "sources": [{ "id": "vacation", "source": "vacation.md" }],
  "grounding": { "grounded": true, "groundedness": 1, "unsupported": [] }
}
```

`grounded: false` lists the sentences no passage supports, so you can flag or retry them.

## Make it yours

- **Your documents:** replace the files in `docs/` (Markdown or text). They're indexed in memory on the first request with the library's built-in TF-IDF embedder: no database, no embedding API.
- **More documents:** swap `MemoryRetriever` in `lib/rag.ts` for `QdrantRetriever` or `PgVectorRetriever`, and `LocalEmbedder` for an embedding model (`OpenAIConnector`, or any AI SDK embedding model through `createAiSdkAdapter`).
- **Another model:** set `ANTHROPIC_MODEL`, or replace `anthropic(...)` in `app/api/ask/route.ts` with any AI SDK provider.
- **Paraphrases:** the check is lexical, so a correct paraphrase can be reported unsupported. Pass `judge` to `groundingMiddleware` to have a model rule on those sentences ([LLM judge](https://devilsdev.github.io/rag-pipeline-utils/docs/Evaluation#paraphrases-the-optional-llm-judge)).
- **Guardrails:** `groundingMiddleware({ preRetrieval: true, postGeneration: true })` adds prompt-injection detection on the question and PII redaction on the answer.

## Deploy

On Vercel, import the repository and set `ANTHROPIC_API_KEY`. `next.config.ts` includes `docs/` in the deployment of the route that reads it.

## Files

| File                   | What it does                                             |
| ---------------------- | -------------------------------------------------------- |
| `app/api/ask/route.ts` | The API: retrieval, the model call, the grounding report |
| `lib/rag.ts`           | Indexes `docs/` in memory, once per server process       |
| `app/page.tsx`         | The page: a question box, the answer, its sources        |
| `next.config.ts`       | Loads the library with Node at runtime; deploys `docs/`  |
