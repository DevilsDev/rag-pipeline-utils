# Docs agent (Mastra)

A [Mastra](https://mastra.ai) agent that answers questions from the Markdown files in `docs/`, made with [`create-rag-pipeline`](https://devilsdev.github.io/rag-pipeline-utils/docs/Starter-Templates). [`@devilsdev/rag-pipeline-utils`](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils) provides the retrieval behind its `search_documents` tool, a groundedness scorer (no model calls) and guardrails: prompt-injection detection on the question, PII redaction on the answer.

## Run it

```bash
npm install
npm run ask -- "How many vacation days do I get?"
```

Without an API key it prints the matching passages. To get answers from Claude:

```bash
cp .env.example .env   # then set ANTHROPIC_API_KEY
npm run ask -- "How many vacation days do I get?"
```

```
Full-time employees receive 20 days of paid vacation per year. Unused days carry over until the end of March.

Sources: vacation.md, expenses.md, remote-work.md
Grounded: every sentence is supported by a passage.
```

`npm run dev` opens Mastra Studio, where you can chat with the agent and see the groundedness score of each answer.

## Make it yours

- **Your documents:** replace the files in `docs/` (Markdown or text), or set `DOCS_DIR`. They're indexed in memory on first use with the library's built-in TF-IDF embedder.
- **More documents:** swap `MemoryRetriever` in `src/mastra/retrieval.ts` for `QdrantRetriever` or `PgVectorRetriever`, and `LocalEmbedder` for an embedding model.
- **Another model:** set `MODEL` to any model Mastra's router knows (`anthropic/claude-haiku-4-5`, `openai/gpt-5`, ...).
- **Other scores:** `createMastraScorer` also takes `metric: "faithfulness"`, `"contextPrecision"` or `"contextRecall"`.
- **Storage:** `src/mastra/index.ts` keeps threads and scores in memory; use `@mastra/libsql` or `@mastra/pg` to keep them.

## Deploy

`npm run build` writes a server to `.mastra/output`; run it with `node .mastra/output/index.mjs` from the project folder (it reads `docs/`), or deploy it with one of Mastra's deployers.

## Files

| File                                   | What it does                                                    |
| -------------------------------------- | --------------------------------------------------------------- |
| `src/mastra/agents/docs-agent.ts`      | The agent: instructions, model, tool, scorer, guardrails        |
| `src/mastra/tools/search-documents.ts` | The `search_documents` tool                                     |
| `src/mastra/retrieval.ts`              | Indexes `docs/` in memory                                       |
| `src/ask.ts`                           | `npm run ask`: one question, the answer and its grounding check |
