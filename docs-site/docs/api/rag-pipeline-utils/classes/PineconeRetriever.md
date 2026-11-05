---
mdx:
  format: md
---

# Class: PineconeRetriever

Retriever on a Pinecone serverless index over its REST API, with no
client package. The index must exist: with a dense vector of your
embedding model's dimension, or with a text field Pinecone embeds itself
(then documents need no vector and retrieve() takes the query text). Use
the cosine metric for the scores the other retrievers return.

## Constructors

### Constructor

```ts
new PineconeRetriever(options?): PineconeRetriever;
```

#### Parameters

| Parameter                     | Type                                                                                                                                                                                                                                                                        | Description                                                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `options?`                    | \{ `api?`: `"documents"` \| `"auto"` \| `"vectors"`; `apiKey?`: `string`; `cacheKey?`: `string`; `fetch?`: `Function`; `freshnessTimeoutMs?`: `number`; `host?`: `string`; `index?`: `string`; `namespace?`: `string`; `textField?`: `string`; `vectorField?`: `string`; \} | -                                                                                                                                            |
| `options.api?`                | `"documents"` \| `"auto"` \| `"vectors"`                                                                                                                                                                                                                                    | Document index (Documents API) or vector index; auto reads it from the index description                                                     |
| `options.apiKey?`             | `string`                                                                                                                                                                                                                                                                    | Defaults to PINECONE_API_KEY                                                                                                                 |
| `options.cacheKey?`           | `string`                                                                                                                                                                                                                                                                    | Cache identity; change it when the index changes                                                                                             |
| `options.fetch?`              | `Function`                                                                                                                                                                                                                                                                  | fetch implementation (defaults to the global)                                                                                                |
| `options.freshnessTimeoutMs?` | `number`                                                                                                                                                                                                                                                                    | How long a read waits for this retriever's writes to be indexed; 0 to not wait                                                               |
| `options.host?`               | `string`                                                                                                                                                                                                                                                                    | The index host (from the console), instead of or with `index`                                                                                |
| `options.index?`              | `string`                                                                                                                                                                                                                                                                    | The index name, described on first use                                                                                                       |
| `options.namespace?`          | `string`                                                                                                                                                                                                                                                                    | A namespace this retriever owns                                                                                                              |
| `options.textField?`          | `string`                                                                                                                                                                                                                                                                    | The document index's text field that Pinecone embeds (integrated embedding; default: the schema's, when the index has no dense_vector field) |
| `options.vectorField?`        | `string`                                                                                                                                                                                                                                                                    | The document index's dense_vector field (default: the schema's)                                                                              |

#### Returns

`PineconeRetriever`

## Properties

| Property                                                      | Type     |
| ------------------------------------------------------------- | -------- |
| <a id="property-cachekey"></a> `cacheKey`                     | `string` |
| <a id="property-freshnesstimeoutms"></a> `freshnessTimeoutMs` | `number` |
| <a id="property-index"></a> `index`                           | `string` |
| <a id="property-namespace"></a> `namespace`                   | `string` |

## Methods

### clear()

```ts
clear(): Promise<void>;
```

Deletes every document this retriever stored in its namespace.

#### Returns

`Promise`\<`void`\>

---

### delete()

```ts
delete(ids): Promise<void>;
```

Deletes documents by id.

#### Parameters

| Parameter | Type       | Description |
| --------- | ---------- | ----------- |
| `ids`     | `string`[] | -           |

#### Returns

`Promise`\<`void`\>

---

### getCacheKey()

```ts
getCacheKey(role): string;
```

Cache identity for createRagPipeline({ cache }): none unless you set
`cacheKey`, since other clients can change the index.

#### Parameters

| Parameter | Type          | Description |
| --------- | ------------- | ----------- |
| `role`    | `"retriever"` | -           |

#### Returns

`string`

---

### list()

```ts
list(options?): Promise<object[]>;
```

Every document, without vectors.

#### Parameters

| Parameter        | Type                      | Description |
| ---------------- | ------------------------- | ----------- |
| `options?`       | \{ `limit?`: `number`; \} | -           |
| `options.limit?` | `number`                  | -           |

#### Returns

`Promise`\<`object`[]\>

---

### removeBySource()

```ts
removeBySource(source): Promise<void>;
```

Deletes the chunks of one source (`metadata.source`), for re-ingesting.

#### Parameters

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `source`  | `string` | -           |

#### Returns

`Promise`\<`void`\>

---

### retrieve()

```ts
retrieve(request, k?): Promise<object[]>;
```

The documents most similar to a query vector, or to the query text on
an index that embeds text itself (Pinecone embeds the query; a
`queryVector` is then ignored).

#### Parameters

| Parameter | Type                                                                                                                            | Description                                                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `request` | \| `string` \| `number`[] \| \{ `query?`: `string`; `queryVector?`: `number`[]; `signal?`: `AbortSignal`; `topK?`: `number`; \} | A vector, the query text, or an object with them: `queryVector`, or `query` on an index that embeds text itself (required; optional in the type to match the retriever contract) |
| `k?`      | `number`                                                                                                                        | Results when `request` is a vector or text                                                                                                                                       |

#### Returns

`Promise`\<`object`[]\>

---

### size()

```ts
size(): Promise<number>;
```

#### Returns

`Promise`\<`number`\>

The documents this retriever stored

---

### store()

```ts
store(docs): Promise<void>;
```

Inserts or replaces documents. On an index that embeds text itself,
Pinecone embeds `content` (required there) and `vector` is ignored.

#### Parameters

| Parameter | Type       | Description                                              |
| --------- | ---------- | -------------------------------------------------------- |
| `docs`    | `object`[] | `vector` is required unless the index embeds text itself |

#### Returns

`Promise`\<`void`\>
