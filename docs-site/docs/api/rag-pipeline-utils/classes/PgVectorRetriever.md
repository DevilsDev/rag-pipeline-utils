---
mdx:
  format: md
---

# Class: PgVectorRetriever

Retriever on PostgreSQL with the pgvector extension. Creates the
extension, table and index on first use; similarity is cosine.

## Constructors

### Constructor

```ts
new PgVectorRetriever(options?): PgVectorRetriever;
```

#### Parameters

| Parameter                   | Type                                                                                                                                                                                                                             | Description                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `options?`                  | \{ `cacheKey?`: `string`; `connectionString?`: `string`; `createTable?`: `boolean`; `dimensions?`: `number`; `index?`: `"hnsw"` \| `"none"`; `pool?`: \{ `connect?`: `Function`; `query`: `Function`; \}; `table?`: `string`; \} | -                                                                  |
| `options.cacheKey?`         | `string`                                                                                                                                                                                                                         | Cache identity; change it when the table changes (see getCacheKey) |
| `options.connectionString?` | `string`                                                                                                                                                                                                                         | Used to create a Pool when no `pool` is given                      |
| `options.createTable?`      | `boolean`                                                                                                                                                                                                                        | Create the extension, table and index on first store               |
| `options.dimensions?`       | `number`                                                                                                                                                                                                                         | Vector size for a new table; defaults to the first stored vector's |
| `options.index?`            | `"hnsw"` \| `"none"`                                                                                                                                                                                                             | Index created with the table                                       |
| `options.pool?`             | \{ `connect?`: `Function`; `query`: `Function`; \}                                                                                                                                                                               | A pg Pool or Client you manage                                     |
| `options.pool.connect?`     | `Function`                                                                                                                                                                                                                       | -                                                                  |
| `options.pool.query`        | `Function`                                                                                                                                                                                                                       | -                                                                  |
| `options.table?`            | `string`                                                                                                                                                                                                                         | Table name, optionally `schema.table`                              |

#### Returns

`PgVectorRetriever`

## Properties

| Property                                        | Type                 |
| ----------------------------------------------- | -------------------- |
| <a id="property-cachekey"></a> `cacheKey`       | `string`             |
| <a id="property-createtable"></a> `createTable` | `boolean`            |
| <a id="property-dimensions"></a> `dimensions`   | `number`             |
| <a id="property-index"></a> `index`             | `"hnsw"` \| `"none"` |
| <a id="property-table"></a> `table`             | `string`             |
| <a id="property-tablename"></a> `tableName`     | `string`             |

## Methods

### clear()

```ts
clear(): Promise<void>;
```

Deletes every document; the table stays.

#### Returns

`Promise`\<`void`\>

---

### close()

```ts
close(): Promise<void>;
```

Closes the Pool this retriever created; a pool you passed in stays open.

#### Returns

`Promise`\<`void`\>

---

### delete()

```ts
delete(ids): Promise<number>;
```

Deletes documents by id.

#### Parameters

| Parameter | Type       | Description |
| --------- | ---------- | ----------- |
| `ids`     | `string`[] | -           |

#### Returns

`Promise`\<`number`\>

Rows deleted

---

### getCacheKey()

```ts
getCacheKey(role): string;
```

Cache identity for createRagPipeline({ cache }). Other processes can
write to the table without this one knowing, so there is none unless
you set `cacheKey`: then cached retrieval results are reused until you
change the key or their time to live ends.

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

Every document, without vectors, in id order.

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
removeBySource(source): Promise<number>;
```

Deletes the chunks of one source (`metadata.source`), for re-ingesting.

#### Parameters

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `source`  | `string` | -           |

#### Returns

`Promise`\<`number`\>

Rows deleted

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

Inserts or replaces documents, in one transaction: a failed batch
changes nothing.

#### Parameters

| Parameter | Type       | Description |
| --------- | ---------- | ----------- |
| `docs`    | `object`[] | -           |

#### Returns

`Promise`\<`void`\>
