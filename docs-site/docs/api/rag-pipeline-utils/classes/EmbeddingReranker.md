---
mdx:
  format: md
---

# Class: EmbeddingReranker

Reranks documents by computing cosine similarity between query and
document embeddings produced by an external embedder.
Implements the reranker contract: rerank(query, documents, options).

Document embeddings are cached in a bounded LRU keyed by a SHA-256 of the
document text, and embedding calls run with bounded concurrency.

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new EmbeddingReranker(embedder, options?): EmbeddingReranker;
```

#### Parameters

| Parameter              | Type                                                    | Description                                         |
| ---------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| `embedder`             | `object`                                                | Must expose .embedQuery(text) or .embed(text)       |
| `options?`             | \{ `cacheSize?`: `number`; `concurrency?`: `number`; \} | -                                                   |
| `options.cacheSize?`   | `number`                                                | Max cached document embeddings (0 disables caching) |
| `options.concurrency?` | `number`                                                | Max concurrent embedding calls                      |

#### Returns

`EmbeddingReranker`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                      | Type     |
| --------------------------------------------- | -------- |
| <a id="property-cachestats"></a> `cacheStats` | `object` |
| `cacheStats.hits`                             | `number` |
| `cacheStats.misses`                           | `number` |
| <a id="property-config"></a> `config`         | `object` |
| `config.cacheSize`                            | `number` |
| `config.concurrency`                          | `number` |
| <a id="property-embedder"></a> `embedder`     | `any`    |

## Methods

### clearCache()

```ts
clearCache(): void;
```

Clear the document embedding cache.

#### Returns

`void`

---

### rerank()

```ts
rerank<T>(
   query,
   documents,
   options?
): Promise<(T & object)[]>;
```

Rerank documents by cosine similarity to the query embedding.

#### Type Parameters

| Type Parameter                                        | Description |
| ----------------------------------------------------- | ----------- |
| <a id="type-parameter-t"></a> `T` _extends_ `unknown` |             |

#### Parameters

| Parameter         | Type                                               | Description                                       |
| ----------------- | -------------------------------------------------- | ------------------------------------------------- |
| `query`           | `string`                                           | The search query                                  |
| `documents`       | (`string` \| `T`)[]                                | Documents to rerank (a string becomes `{ text }`) |
| `options?`        | \{ `signal?`: `AbortSignal`; `topK?`: `number`; \} | -                                                 |
| `options.signal?` | `AbortSignal`                                      | Cancels pending embedding calls                   |
| `options.topK?`   | `number`                                           | Maximum number of results to return               |

#### Returns

`Promise`\<(`T` & `object`)[]\>

Reranked documents with .relevanceScore
