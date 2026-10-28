# OpenAI + Pinecone RAG Pipeline Example

A RAG pipeline that uses:

- **OpenAI** (`OpenAIConnector` from the library) for embeddings and answers
- **Pinecone** for vector storage, through a small retriever adapter
  (`PineconeRetriever` in `index.js`)
- **`createRagPipeline`** to wire them together, with citations and
  evaluation

It also has an **offline mode** that needs no API keys.

## Prerequisites

- Node.js 18 or higher
- For the online mode:
  - OpenAI API key (https://platform.openai.com/)
  - Pinecone API key (https://www.pinecone.io/) and an index named
    `rag-pipeline-demo` (or your own `PINECONE_INDEX_NAME`) with dimension
    `1536` (matches `text-embedding-3-small`) and the cosine metric

## Setup

```bash
npm install
cp .env.example .env    # then fill in the keys
```

`.env` variables:

| Variable                 | Required | Default                  |
| ------------------------ | -------- | ------------------------ |
| `OPENAI_API_KEY`         | online   | none                     |
| `PINECONE_API_KEY`       | online   | none                     |
| `PINECONE_INDEX_NAME`    | no       | `rag-pipeline-demo`      |
| `OPENAI_MODEL`           | no       | `gpt-4o-mini`            |
| `OPENAI_EMBEDDING_MODEL` | no       | `text-embedding-3-small` |
| `USE_MOCK_MODE`          | no       | `false`                  |

## Usage

### Online (OpenAI + Pinecone)

```bash
npm start
```

The run upserts three sample documents into the index (ids `doc-1` to
`doc-3`), waits until Pinecone reports them, then asks one question. Each run
makes 4 embedding calls and 1 chat completion.

### Offline mode (no API keys, no network)

```bash
npm run mock
```

Or `node index.js --mock`, or set `USE_MOCK_MODE=true`. Offline mode replaces
OpenAI and Pinecone with the built-in `LocalEmbedder` (TF-IDF),
`MemoryRetriever` and an extractive stub llm that returns the first sentence
of the best document. Retrieval is lexical, so rankings differ from the
online mode.

Offline output:

```
RAG Pipeline - OpenAI + Pinecone
================================

MOCK MODE: LocalEmbedder + MemoryRetriever + stub llm (no API calls)

Embedding 3 documents...
Stored 3 vectors

Query: What is machine learning?

Retrieved 3 documents:
  doc-2  score=0.321
  doc-1  score=0.226
  doc-3  score=0.000

Answer:
------------------------------------------------------------
Deep learning is a specialized form of machine learning that uses neural networks with multiple layers.
------------------------------------------------------------
Groundedness: 1.00
Evaluation:   faithfulness=1.00 relevance=0.59 contextPrecision=0.67 groundedness=0.86

Pipeline completed successfully.
```

## How It Works

```javascript
const openai = new OpenAIConnector({ model: "gpt-4o-mini" }); // reads OPENAI_API_KEY
const retriever = new PineconeRetriever(); // reads PINECONE_API_KEY

// Index: embed each document and upsert it (content kept in metadata)
await retriever.store([
  { id, vector: await openai.embed(text), content: text },
]);

// Query: the pipeline embeds the query, calls
// retriever.retrieve({ query, queryVector, topK, signal }) and then
// openai.generate(query, results, { signal })
const pipeline = createRagPipeline({
  embedder: openai,
  retriever,
  llm: openai,
});
const result = await pipeline.run({
  query: "What is machine learning?",
  options: { topK: 3, citations: true, evaluate: true, timeout: 60000 },
});
// { success, query, results, answer, citations, evaluation }
```

A failed run resolves `{ success: false, error }` instead of throwing (for
example `Execution timeout`). Pass `options.signal` (an `AbortSignal`) to
cancel a run. The OpenAI connector retries transient failures (429, 5xx,
network) itself; a missing key fails fast with code `MISSING_API_KEY`.

## Customization

- **Documents**: edit the `documents` array in `index.js`.
- **Retrieval**: change `topK` in the `run()` options.
- **Models**: set `OPENAI_MODEL` / `OPENAI_EMBEDDING_MODEL`. A different
  embedding model may need an index with a different dimension
  (`text-embedding-3-large` is 3072).

## Troubleshooting

- **`OPENAI_API_KEY is required` / `PINECONE_API_KEY is required`**: set the
  key in `.env` (no quotes) or use `npm run mock`.
- **Index not found**: create the index or set `PINECONE_INDEX_NAME`.
- **Dimension mismatch**: the index dimension must equal the embedding size
  (1536 for `text-embedding-3-small`).
- **`Pinecone index not fully updated yet`**: upserts are eventually
  consistent; rerun, or results may be partial on the first run.

## Resources

- [RAG Pipeline Utils documentation](https://devilsdev.github.io/rag-pipeline-utils/)
- [OpenAI API documentation](https://platform.openai.com/docs)
- [Pinecone documentation](https://docs.pinecone.io/)

## License

GPL-3.0
