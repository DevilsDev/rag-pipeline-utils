---
mdx:
  format: md
---

# Class: QdrantRetriever

## Constructors

### Constructor

```ts
new QdrantRetriever(options?): QdrantRetriever;
```

#### Parameters

| Parameter                   | Type                                                                                                                                                                        | Description                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `options?`                  | \{ `apiKey?`: `string`; `cacheKey?`: `string`; `collection?`: `string`; `createCollection?`: `boolean`; `dimensions?`: `number`; `fetch?`: `Function`; `url?`: `string`; \} | -                                                                       |
| `options.apiKey?`           | `string`                                                                                                                                                                    | Sent as the `api-key` header                                            |
| `options.cacheKey?`         | `string`                                                                                                                                                                    | Cache identity; change it when the collection changes                   |
| `options.collection?`       | `string`                                                                                                                                                                    | -                                                                       |
| `options.createCollection?` | `boolean`                                                                                                                                                                   | Create the collection on first store                                    |
| `options.dimensions?`       | `number`                                                                                                                                                                    | Vector size for a new collection; defaults to the first stored vector's |
| `options.fetch?`            | `Function`                                                                                                                                                                  | fetch implementation (defaults to the global)                           |
| `options.url?`              | `string`                                                                                                                                                                    | Qdrant's REST endpoint                                                  |

#### Returns

`QdrantRetriever`

## Properties

| Property                                                  | Type      |
| --------------------------------------------------------- | --------- |
| <a id="property-cachekey"></a> `cacheKey`                 | `string`  |
| <a id="property-collection"></a> `collection`             | `string`  |
| <a id="property-createcollection"></a> `createCollection` | `boolean` |
| <a id="property-dimensions"></a> `dimensions`             | `number`  |
| <a id="property-url"></a> `url`                           | `string`  |

## Methods

### clear()

```ts
clear(): Promise<void>;
```

Deletes every document this class stored; the collection stays.

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
`cacheKey`, since other clients can change the collection.

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

| Parameter | Type                                                                                           | Description                        |
| --------- | ---------------------------------------------------------------------------------------------- | ---------------------------------- |
| `request` | \| `number`[] \| \{ `queryVector`: `number`[]; `signal?`: `AbortSignal`; `topK?`: `number`; \} | -                                  |
| `k?`      | `number`                                                                                       | Results when `request` is a vector |

#### Returns

`Promise`\<`object`[]\>

---

### size()

```ts
size(): Promise<number>;
```

#### Returns

`Promise`\<`number`\>

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
