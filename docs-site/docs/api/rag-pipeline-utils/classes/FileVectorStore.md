---
mdx:
  format: md
---

# Class: FileVectorStore

Vector store persisted to a single JSON file, so separate processes (e.g.
`rag-pipeline ingest` then `rag-pipeline query`) share one index. Intended
for local use and small corpora: every query is a linear scan.

The index records which embedder produced the vectors (name, dimensions and
optional serialized state) and refuses queries whose vector dimension does
not match, instead of silently comparing incompatible vectors.

## Constructors

### Constructor

```ts
new FileVectorStore(options?): FileVectorStore;
```

#### Parameters

| Parameter      | Type                    | Description         |
| -------------- | ----------------------- | ------------------- |
| `options?`     | \{ `path`: `string`; \} | -                   |
| `options.path` | `string`                | Index file location |

#### Returns

`FileVectorStore`

## Properties

| Property                          | Type     |
| --------------------------------- | -------- |
| <a id="property-path"></a> `path` | `string` |

## Methods

### clear()

```ts
clear(): void;
```

Remove every document and the recorded embedder info.

#### Returns

`void`

---

### getCacheKey()

```ts
getCacheKey(role): string;
```

Cache identity for createRagPipeline({ cache }): a digest of the index
as loaded, so processes reading the same unchanged index share cached
results; after this instance changes the index the key also carries the
instance and a revision.

#### Parameters

| Parameter | Type          | Description |
| --------- | ------------- | ----------- |
| `role`    | `"retriever"` | -           |

#### Returns

`string`

---

### getEmbedderInfo()

```ts
getEmbedderInfo(): object;
```

#### Returns

`object`

Embedder metadata recorded with the vectors

---

### list()

```ts
list(): object[];
```

#### Returns

`object`[]

---

### load()

```ts
load(): object;
```

Read the index from disk (cached after the first call).

#### Returns

`object`

##### documents

```ts
documents: object;
```

##### embedder

```ts
embedder: object;
```

##### version

```ts
version: number;
```

---

### removeBySource()

```ts
removeBySource(source): number;
```

Remove every document whose metadata.source equals `source`.

#### Parameters

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `source`  | `string` | -           |

#### Returns

`number`

Number of documents removed

---

### retrieve()

```ts
retrieve(request?): Promise<object[]>;
```

Cosine-similarity search.

#### Parameters

| Parameter             | Type                                                | Description |
| --------------------- | --------------------------------------------------- | ----------- |
| `request?`            | \{ `queryVector`: `number`[]; `topK?`: `number`; \} | -           |
| `request.queryVector` | `number`[]                                          | -           |
| `request.topK?`       | `number`                                            | -           |

#### Returns

`Promise`\<`object`[]\>

---

### save()

```ts
save(): void;
```

Write the index atomically: temp file in the same directory, then rename.

#### Returns

`void`

---

### setEmbedderInfo()

```ts
setEmbedderInfo(info): void;
```

#### Parameters

| Parameter         | Type                                                                | Description |
| ----------------- | ------------------------------------------------------------------- | ----------- |
| `info`            | \{ `dimensions`: `number`; `name`: `string`; `state?`: `object`; \} | -           |
| `info.dimensions` | `number`                                                            | -           |
| `info.name`       | `string`                                                            | -           |
| `info.state?`     | `object`                                                            | -           |

#### Returns

`void`

---

### size()

```ts
size(): number;
```

#### Returns

`number`

---

### store()

```ts
store(docs): Promise<void>;
```

Add or replace documents. Ids are caller-chosen; re-storing an id
replaces the previous entry.

#### Parameters

| Parameter | Type       | Description |
| --------- | ---------- | ----------- |
| `docs`    | `object`[] | -           |

#### Returns

`Promise`\<`void`\>
