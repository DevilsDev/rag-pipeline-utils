---
mdx:
  format: md
---

# Class: PineconeRetriever

Retriever on a Pinecone serverless index over its REST API, with no
client package. The index must exist; its dimension and metric (cosine
for the scores the other retrievers return) are set when it is created.

## Constructors

### Constructor

```ts
new PineconeRetriever(options?): PineconeRetriever;
```

#### Parameters

| Parameter                     | Type                                                                                                                                                                    | Description                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `options?`                    | \{ `apiKey?`: `string`; `cacheKey?`: `string`; `fetch?`: `Function`; `freshnessTimeoutMs?`: `number`; `host?`: `string`; `index?`: `string`; `namespace?`: `string`; \} | -                                                                              |
| `options.apiKey?`             | `string`                                                                                                                                                                | Defaults to PINECONE_API_KEY                                                   |
| `options.cacheKey?`           | `string`                                                                                                                                                                | Cache identity; change it when the index changes                               |
| `options.fetch?`              | `Function`                                                                                                                                                              | fetch implementation (defaults to the global)                                  |
| `options.freshnessTimeoutMs?` | `number`                                                                                                                                                                | How long a read waits for this retriever's writes to be indexed; 0 to not wait |
| `options.host?`               | `string`                                                                                                                                                                | The index host (from the console or describe_index); or give `index`           |
| `options.index?`              | `string`                                                                                                                                                                | The index name, resolved to its host on first use                              |
| `options.namespace?`          | `string`                                                                                                                                                                | A namespace this retriever owns                                                |

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

Deletes every record in this retriever's namespace.

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

The documents most similar to a query vector.

#### Parameters

| Parameter | Type                                                                                            | Description                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `request` | \| `number`[] \| \{ `queryVector?`: `number`[]; `signal?`: `AbortSignal`; `topK?`: `number`; \} | A vector, or an object with one (required; optional in the type to match the retriever contract) |
| `k?`      | `number`                                                                                        | Results when `request` is a vector                                                               |

#### Returns

`Promise`\<`object`[]\>

---

### size()

```ts
size(): Promise<number>;
```

#### Returns

`Promise`\<`number`\>

The records in this retriever's namespace

---

### store()

```ts
store(docs): Promise<void>;
```

Inserts or replaces documents.

#### Parameters

| Parameter | Type       | Description |
| --------- | ---------- | ----------- |
| `docs`    | `object`[] | -           |

#### Returns

`Promise`\<`void`\>
