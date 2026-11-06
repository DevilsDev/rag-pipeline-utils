---
id: Concepts-Connectors
title: "Connectors: providers and stores"
sidebar_label: Connectors
description: Provider integrations for embedders, vector stores, and LLMs. Swappable, contract-validated, and isolatable from your pipeline orchestration.
---

# Concept: rag-connectors

The framework's connector layer is the boundary between the pipeline
and the outside world: embedding providers, vector stores, LLM APIs,
document loaders. Every connector implements a [plugin contract](./Plugins)
defined as a JSON schema in `contracts/`.

## What's in rag-connectors

### Embedders

| Connector          | Notes                                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OpenAIConnector`  | `embed()` / `embedQuery()` via OpenAI embeddings (`embeddingModel`, default `text-embedding-3-small`). Reads `OPENAI_API_KEY`. Needs the `openai` package: `npm install openai`. |
| `CohereConnector`  | `embed()` / `embedQuery()` via Cohere embed; also `rerank()`. Reads `COHERE_API_KEY`.                                                                                            |
| `OllamaConnector`  | `embed()` / `embedQuery()` against a local Ollama server.                                                                                                                        |
| `LocalEmbedder`    | Pure-JS TF-IDF for development, tests and small corpora. No network. Fit it with `train(documents)`; `getState()` / `setState()` persist the vocabulary.                         |
| Custom (your code) | Implement the `embedder` contract: `embed(text, { signal })` returning `number[]` (optionally `embedQuery()` for queries).                                                       |

### Retrievers / Vector stores

| Connector           | Notes                                                                                                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MemoryRetriever`   | In-process cosine-similarity store. Needs a `queryVector` (pass an embedder to the pipeline). Enforces `maxDocuments` (default 100000; `eviction: 'fifo'` drops the oldest) and rejects mismatched vector dimensions. |
| `FileVectorStore`   | JSON-file vector index with atomic writes, embedder/dimension tracking and per-source re-ingestion. Used by the CLI (`file-store`, `.rag/index.json`).                                                                |
| `HybridRetriever`   | Combines several retrievers (e.g. vector + `BM25Search`) with Reciprocal Rank Fusion.                                                                                                                                 |
| `GraphRetriever`    | Knowledge-graph retrieval over extracted entities.                                                                                                                                                                    |
| `PgVectorRetriever` | PostgreSQL with pgvector: cosine similarity, upserts in one transaction, an HNSW index. See [PostgreSQL with pgvector](#postgresql-with-pgvector).                                                                    |
| `QdrantRetriever`   | Qdrant over its REST API, with no client package. See [Qdrant](#qdrant).                                                                                                                                              |
| `PineconeRetriever` | A Pinecone serverless index over its REST API, with no client package. See [Pinecone](#pinecone).                                                                                                                     |
| `WeaviateRetriever` | Weaviate over its REST and GraphQL APIs, with no client package. See [Weaviate](#weaviate).                                                                                                                           |
| Others              | Build your own retriever with the [retriever contract](./Plugins).                                                                                                                                                    |

### PostgreSQL with pgvector

`PgVectorRetriever` keeps documents in a PostgreSQL table with the [pgvector](https://github.com/pgvector/pgvector) extension. Pass a [`pg`](https://www.npmjs.com/package/pg) Pool you manage, or a connection string and install `pg` yourself (`npm install pg`; an optional peer dependency, loaded only when used):

```javascript no-run
import pg from "pg";
import {
  createRagPipeline,
  OpenAIConnector,
  PgVectorRetriever,
} from "@devilsdev/rag-pipeline-utils";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const retriever = new PgVectorRetriever({ pool, table: "rag_documents" });
const embedder = new OpenAIConnector();

await retriever.store([
  {
    id: "handbook.md#0",
    content: "Full-time employees receive twenty days of paid vacation.",
    metadata: { source: "handbook.md" },
    vector: await embedder.embed(
      "Full-time employees receive twenty days of paid vacation.",
    ),
  },
]);

const pipeline = createRagPipeline({ embedder, retriever, llm: embedder });
```

The first `store()` creates the extension, the table (sized to the first vector, or to `dimensions`) and an HNSW cosine index, unless you pass `createTable: false`. The table has the columns `id` (text, primary key), `content`, `metadata` (jsonb) and `embedding` (vector). Storing a document under an existing id replaces it, and each `store()` runs in one transaction, so a failed batch changes nothing. `score` is 1 minus the cosine distance.

| Option             | Default         | Description                                                               |
| ------------------ | --------------- | ------------------------------------------------------------------------- |
| `pool`             |                 | A `pg` Pool or Client you manage; it stays open after `close()`           |
| `connectionString` |                 | Creates a Pool when there is no `pool`; `close()` ends it                 |
| `table`            | `rag_documents` | Table name, optionally `schema.table`                                     |
| `dimensions`       | first vector's  | Vector size for a new table                                               |
| `createTable`      | `true`          | Create the extension, table and index on the first `store()`              |
| `index`            | `hnsw`          | `none` skips the index                                                    |
| `efSearch`         | 40              | HNSW candidates per query; higher finds more true neighbours, more slowly |
| `cacheKey`         |                 | Cache identity; see below                                                 |

It also has `removeBySource(source)`, `delete(ids)`, `clear()`, `size()` and `list()`, so the CLI can re-ingest files into it.

- **Recall.** The HNSW index searches approximately. At pgvector's default `efSearch` of 40 it can miss some of the true nearest neighbours; raise `efSearch` (100–200) to find more of them for a little more latency. The [benchmarks](./Benchmarks) measure the trade-off. A query always uses an `efSearch` of at least its `topK`, so it returns `topK` results.
- **Bulk loads.** Every insert updates the HNSW index, which makes ingest about ten times slower than without one. For a large first load, create the table with `index: "none"`, store everything, then run `CREATE INDEX ON rag_documents USING hnsw (embedding vector_cosine_ops);` once.
- **Permissions.** `CREATE EXTENSION` needs a database owner on many managed services. If it fails, run `CREATE EXTENSION IF NOT EXISTS vector;` once as the owner.
- **Caching.** Other processes can write to the table without this one knowing, so the retriever has no cache identity and `createRagPipeline({ cache })` doesn't cache its results. Pass `cacheKey` to cache them, and change the key (or rely on the cache's time to live) when the table changes.
- **Cancellation.** A run's `AbortSignal` stops the wait for a query, but PostgreSQL finishes the query itself.

In `.ragrc.json`, the connection string comes from an environment variable, `DATABASE_URL` unless `connectionStringEnv` names another, so it never sits in the config file:

```json
{
  "stage": "retriever",
  "name": "pgvector",
  "config": { "table": "rag_documents" }
}
```

The CLI's `local` embedder can't be used with it: its vocabulary is stored with the `file-store` index. Use `openai`, `ollama` or `cohere`.

### Qdrant

`QdrantRetriever` keeps documents in a [Qdrant](https://qdrant.tech) collection. It talks to Qdrant's REST API with Node's built-in `fetch`, so there's no package to install. It's written against the Qdrant 1.20 API and tested against Qdrant 1.20.

```javascript no-run
import {
  createRagPipeline,
  OpenAIConnector,
  QdrantRetriever,
} from "@devilsdev/rag-pipeline-utils";

const retriever = new QdrantRetriever({
  url: process.env.QDRANT_URL, // default http://localhost:6333
  apiKey: process.env.QDRANT_API_KEY, // Qdrant Cloud
  collection: "rag_documents",
});
const embedder = new OpenAIConnector();
const pipeline = createRagPipeline({ embedder, retriever, llm: embedder });
```

The first `store()` creates the collection (cosine distance, sized to the first vector or to `dimensions`) and a keyword index on `metadata.source`, unless you pass `createCollection: false`. Writes wait until Qdrant has applied them, so a query right after `ingest` sees the new documents.

Qdrant point ids must be integers or UUIDs. Each document's id is turned into a UUID derived from it, and the original id is kept in the payload as `rag_id`, alongside `content` and `metadata`. Results report your original id. Queries, `clear()`, `size()` and `list()` only touch points that have a `rag_id`, so a collection can hold other data too.

| Option             | Default                 | Description                                                  |
| ------------------ | ----------------------- | ------------------------------------------------------------ |
| `url`              | `http://localhost:6333` | Qdrant's REST endpoint                                       |
| `apiKey`           |                         | Sent as the `api-key` header; never included in errors       |
| `collection`       | `rag_documents`         | Letters, digits, `_` and `-`                                 |
| `dimensions`       | first vector's          | Vector size for a new collection                             |
| `createCollection` | `true`                  | Create the collection and index on the first `store()`       |
| `cacheKey`         |                         | Cache identity, as for [pgvector](#postgresql-with-pgvector) |

Like `PgVectorRetriever`, it has `removeBySource`, `delete`, `clear`, `size` and `list` for the CLI. It isn't cached unless you set `cacheKey`, and the run's `AbortSignal` cancels the HTTP request.

In `.ragrc.json`, the URL comes from `config.url` or `QDRANT_URL`, and the API key only from `QDRANT_API_KEY`:

```json
{
  "stage": "retriever",
  "name": "qdrant",
  "config": { "collection": "rag_documents" }
}
```

As with pgvector, the CLI's `local` embedder can't be used with it; use `openai`, `ollama` or `cohere`.

### Pinecone

`PineconeRetriever` keeps documents in a namespace of a [Pinecone](https://www.pinecone.io) serverless index. It talks to Pinecone's REST API (version 2026-07) with the built-in `fetch`, so there's no package to install, and it runs on the [edge build](./Deployment-Edge) too.

```javascript no-run
import {
  createRagPipeline,
  OpenAIConnector,
  PineconeRetriever,
} from "@devilsdev/rag-pipeline-utils";

const retriever = new PineconeRetriever({
  index: "docs", // or host: the index host from the console
  namespace: "rag_documents",
}); // reads PINECONE_API_KEY
const embedder = new OpenAIConnector();
const pipeline = createRagPipeline({ embedder, retriever, llm: embedder });
```

It works with both kinds of Pinecone index, and reads which one from the index description on first use:

| Index                                                                    | API it uses                                                      |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| A document index with a `dense_vector` field (what Pinecone creates now) | The Documents API; your vectors go in that field (`vectorField`) |
| A vector index (created with a dimension and metric)                     | The vectors API (`/vectors/upsert`, `/query`)                    |
| An index that embeds text itself (integrated embedding)                  | The Documents API; Pinecone embeds the text field (`textField`)  |

Create the index first: a dense vector of your embedding model's dimension, or a text field Pinecone embeds, with the cosine metric for the scores the other retrievers return. The retriever owns its namespace: `clear()` deletes everything it stored there.

#### Indexes that embed text (integrated embedding)

An index created with an embedding model, such as the console's quick-start index (a `chunk_text` field embedded with `llama-text-embed-v2`), embeds text itself. The retriever finds that field in the index description: a string field with `embed`. There, `store()` sends each document's `content` in that field and Pinecone embeds it. Documents need no `vector`, and any vector they carry is ignored. `retrieve()` searches by the query text, which Pinecone embeds with the same model. So a pipeline on such an index needs no embedder:

```javascript no-run
import {
  createRagPipeline,
  AnthropicConnector,
  PineconeRetriever,
} from "@devilsdev/rag-pipeline-utils";

const retriever = new PineconeRetriever({ index: "quickstart" });
await retriever.store([
  { id: "vacation#0", content: "Employees get twenty days of paid vacation." },
]);

// No embedder: the pipeline passes the query text to the retriever
const pipeline = createRagPipeline({
  retriever,
  llm: new AnthropicConnector(),
});
const { answer } = await pipeline.run({ query: "How much paid vacation?" });
```

Without an embedder, `createRagPipeline` calls `retrieve({ query, queryVector: undefined, topK })`, and the retriever uses `query`. If you do pass an embedder, the pipeline still embeds the query, and the retriever ignores that vector, so leave the embedder out. Calling the retriever directly, pass `{ query }` or the text itself (`retrieve("How much paid vacation?", 5)`). A request with only a vector is refused with the reason. A document without `content` is refused before anything is sent, because Pinecone fails a whole request when one document has no text to embed. Upserts go in batches of up to 96 documents, and under Pinecone's 2 MB a request.

An index with both a `dense_vector` field and an embedded text field gets your vectors, as on 3.6.0; pass `textField` to use the text field instead. `list()` and `size()` search too, with a fixed query text, so each call embeds a few tokens.

`embedsText()` resolves `true` on such an index (it reads the description). The CLI checks it: with `"name": "pinecone"` on an index that embeds text, `.ragrc.json` needs no embedder stage, `rag-pipeline ingest` stores the chunks' text without computing vectors, and `query` sends the question's text ([CLI: no embedder](./CLI.md#no-embedder-a-retriever-that-embeds-text)).

Pinecone is eventually consistent. Like Qdrant's waited writes, a read waits until this retriever's own writes are indexed: Pinecone returns a log sequence number for each write and, on each search, the highest one it reflects ([data freshness](https://docs.pinecone.io/guides/index-data/check-data-freshness)). It waits up to `freshnessTimeoutMs`; writes from other processes aren't waited for. On a document index, `list()` and `size()` search too, so they reflect your writes for up to 10,000 documents; beyond that they page through a fetch that can lag by seconds.

Pinecone metadata is flat. Each record keeps your id as `rag_id` (ids that Pinecone rejects, such as non-ASCII ones, become a hash), the content as `rag_content`, your metadata as JSON in `rag_metadata`, and `metadata.source` as `rag_source` for `removeBySource`. Results report your original id and metadata.

| Option               | Default            | Description                                                        |
| -------------------- | ------------------ | ------------------------------------------------------------------ |
| `apiKey`             | `PINECONE_API_KEY` | Sent as the `Api-Key` header; never included in errors             |
| `index`              |                    | The index name                                                     |
| `host`               |                    | The index host, instead of or with `index`                         |
| `namespace`          | `rag_documents`    | A namespace this retriever owns                                    |
| `api`                | `auto`             | `documents` or `vectors` to skip reading the index description     |
| `vectorField`        | the schema's       | A document index's `dense_vector` field                            |
| `textField`          | the schema's       | A document index's text field that Pinecone embeds                 |
| `freshnessTimeoutMs` | `30000`            | How long a read waits for this retriever's writes; `0` to not wait |
| `cacheKey`           |                    | Cache identity, as for [pgvector](#postgresql-with-pgvector)       |

It has `removeBySource`, `delete`, `clear`, `size` and `list` for the CLI, and passes the same retriever contract as pgvector and Qdrant: in CI against an eventually consistent in-memory Pinecone of all three kinds, and before a release against real indexes (`npm run test:live`); on an index that embeds text, it passes the same checks with text queries. In `.ragrc.json`, the index comes from `config.index` (or `config.host`) or `PINECONE_INDEX`, and the API key only from `PINECONE_API_KEY`:

```json
{
  "stage": "retriever",
  "name": "pinecone",
  "config": { "index": "docs", "namespace": "rag_documents" }
}
```

### Weaviate

`WeaviateRetriever` keeps documents in a [Weaviate](https://weaviate.io) collection. It talks to Weaviate's REST and GraphQL APIs with the built-in `fetch`, so there's no package to install, and it runs on the [edge build](./Deployment-Edge) too. It's written against the Weaviate 1.39 and 1.40 APIs (the same for the endpoints it uses) and tested against Weaviate 1.40.4.

```javascript no-run
import {
  createRagPipeline,
  OpenAIConnector,
  WeaviateRetriever,
} from "@devilsdev/rag-pipeline-utils";

const retriever = new WeaviateRetriever({
  url: process.env.WEAVIATE_URL, // default http://localhost:8080
  apiKey: process.env.WEAVIATE_API_KEY, // Weaviate Cloud
  collection: "RagDocuments",
});
const embedder = new OpenAIConnector();
const pipeline = createRagPipeline({ embedder, retriever, llm: embedder });
```

The first `store()` creates the collection for vectors you provide (`vectorizer: "none"`, an HNSW index with cosine distance), unless you pass `createCollection: false`. On a collection created elsewhere, it adds the properties it needs and leaves the rest alone. It uses the collection's single unnamed vector, so a collection made with named vectors only (what Weaviate 1.40's auto-schema creates) doesn't work with it: let the retriever create its collection. `score` is 1 minus Weaviate's cosine distance, the cosine similarity the other retrievers return. Writes are searchable as soon as `store()` returns, unless the server runs with asynchronous indexing (`ASYNC_INDEXING`).

Weaviate object ids must be UUIDs. Each document's id becomes the same UUID `QdrantRetriever` derives from it, and the original id is kept in the `rag_id` property, alongside `content`. Weaviate properties need a schema, so your metadata is kept as JSON in `rag_metadata`, and `metadata.source` is copied to `rag_source` (exact match) for `removeBySource`. Results report your original id and metadata. Queries, `clear()`, `size()` and `list()` only touch objects that have a `rag_id`, so a collection can hold other data too.

Weaviate keeps no vector size in its schema, so the retriever reads it from a stored object (or takes `dimensions`) and rejects a batch of another size before sending it.

| Option             | Default                 | Description                                                                               |
| ------------------ | ----------------------- | ----------------------------------------------------------------------------------------- |
| `url`              | `http://localhost:8080` | Weaviate's REST endpoint, without `/v1`                                                   |
| `apiKey`           |                         | Sent as `Authorization: Bearer`; never included in errors                                 |
| `collection`       | `RagDocuments`          | A letter, then letters, digits and `_`; the first letter is upper-cased, as Weaviate does |
| `dimensions`       | the collection's        | The vector size to expect                                                                 |
| `createCollection` | `true`                  | Create the collection (or add its missing properties) on the first `store()`              |
| `cacheKey`         |                         | Cache identity, as for [pgvector](#postgresql-with-pgvector)                              |

It has `removeBySource`, `delete`, `clear`, `size` and `list` for the CLI, and passes the same retriever contract as pgvector and Qdrant against a real Weaviate in CI. It isn't cached unless you set `cacheKey`, and the run's `AbortSignal` cancels the HTTP request. In `.ragrc.json`, the URL comes from `config.url` or `WEAVIATE_URL`, and the API key only from `WEAVIATE_API_KEY`:

```json
{
  "stage": "retriever",
  "name": "weaviate",
  "config": { "collection": "RagDocuments" }
}
```

As with pgvector, the CLI's `local` embedder can't be used with it; use `openai`, `ollama` or `cohere`.

### LLMs

| Connector            | Notes                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `OpenAIConnector`    | OpenAI Chat Completions (default model `gpt-4o-mini`) + streaming via `generateStream()`. Needs `npm install openai`.                   |
| `AnthropicConnector` | Anthropic Messages API + streaming. Reads `ANTHROPIC_API_KEY`.                                                                          |
| `OllamaConnector`    | Local Ollama server for offline development and self-hosted production.                                                                 |
| Custom               | Implement the `llm` contract: `generate(query, docs, { signal, ...options })` returning a string, and optionally `generateStream(...)`. |

All built-in connectors retry only transient failures (network errors, 408/409/425/429/5xx) with exponential backoff, jitter and `Retry-After`, fail fast with `MISSING_API_KEY` when a hosted API has no key configured (`OpenAIConnector` also rejects with `MISSING_DEPENDENCY` when the optional `openai` package isn't installed), honour the run's `AbortSignal`, and pass retrieved context to the model as delimited, untrusted reference data in the user message.

### OpenAI-compatible providers (`baseURL`)

`OpenAIConnector` works with any server that implements the OpenAI API (Groq, Together, the Hugging Face router, vLLM, LM Studio, Ollama's `/v1` endpoint) when you pass `baseURL` and the provider's model names.

```javascript no-run
import { OpenAIConnector } from "@devilsdev/rag-pipeline-utils";

// A hosted provider: pass its key explicitly.
const groq = new OpenAIConnector({
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY,
  model: "llama-3.1-8b-instant",
});

// A local server that needs no key.
const local = new OpenAIConnector({
  baseURL: "http://localhost:1234/v1",
  model: "qwen2.5-7b-instruct",
  embeddingModel: "nomic-embed-text",
});
```

With a custom `baseURL` the connector **never** reads `OPENAI_API_KEY`, so your OpenAI key is not sent to another provider. Pass `apiKey` for hosted providers, or leave it out for local servers that need none.

### Loaders

| Connector                                           | Notes                                                             |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| Built-in document reader (`auto` loader in the CLI) | Markdown, HTML, CSV and plain text files, or a directory of them. |
| Custom                                              | Implement the `loader` contract: `load()`.                        |

### Rerankers

| Connector           | Notes                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `ScoringReranker`   | Lexical (BM25-style) scoring on top of vector retrieval.                                               |
| `EmbeddingReranker` | Re-scores with an embedder; LRU cache of document embeddings (`cacheSize`), `concurrency` (default 4). |
| `CascadeReranker`   | Chains rerankers (cheap first, expensive last) for cost-effective reranking.                           |
| `CohereConnector`   | `rerank()` via Cohere's rerank API.                                                                    |

## Why a connector layer

Three reasons:

1. **Vendor independence.** You can swap OpenAI for Anthropic without
   touching pipeline code. The pipeline doesn't know which LLM it's
   calling.
2. **Contract enforcement.** Every connector must satisfy a JSON
   schema in `contracts/`. Plugins that don't register fail loudly,
   not silently.
3. **Isolated security review.** When you add a new provider, the
   review surface is one file implementing one contract — not a
   pipeline-wide refactor.

## Adding a connector

```js no-run
import {
  pluginRegistry,
  createRagPipeline,
} from "@devilsdev/rag-pipeline-utils";

const myEmbedder = {
  metadata: { name: "vendor-x-embedder", version: "1.0.0", type: "embedder" },
  async embed(text, { signal } = {}) {
    /* call vendor X, passing signal to fetch */
    return vector; // number[]
  },
};

await pluginRegistry.register("embedder", "vendor-x-embedder", myEmbedder);

// Now usable by name
const pipeline = createRagPipeline({
  embedder: "vendor-x-embedder",
  retriever,
  llm,
});
```

The registry checks the plugin's `metadata` (`name`, `version`, `type`) and validates it against
`contracts/embedder-contract.json` on registration; registration throws if either check fails. See [Plugins](./Plugins) for the full guide.

## Stability

Connector classes shipped in the package are part of the public API
surface and follow the [SEMVER policy](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SEMVER.md).

Connector **contracts** in `contracts/` are also stable. Adding new
optional fields is non-breaking; removing or renaming required fields
is breaking and ships only in major versions.

## Related

- [Plugins](./Plugins) — full plugin development guide
- [Architecture](./Architecture.md#plugin-system) — internal plugin registry design
- [Plugins](./Plugins) — writing a custom retriever or embedder; [examples/openai-pinecone](https://github.com/DevilsDev/rag-pipeline-utils/tree/main/examples/openai-pinecone) adapts a Pinecone index
