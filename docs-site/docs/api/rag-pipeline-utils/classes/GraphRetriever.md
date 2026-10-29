---
mdx:
  format: md
---

# Class: GraphRetriever

Retriever that uses a knowledge graph for document retrieval.

Combines entity-based graph traversal with token-overlap text scoring
to rank and retrieve relevant documents from a corpus.

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new GraphRetriever(options?): GraphRetriever;
```

#### Parameters

| Parameter                   | Type                                                                                                                                        | Description                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `options?`                  | \{ `entityWeight?`: `number`; `extractorOptions?`: `any`; `maxResults?`: `number`; `textWeight?`: `number`; `traversalDepth?`: `number`; \} | Retriever options               |
| `options.entityWeight?`     | `number`                                                                                                                                    | Weight for entity-graph score   |
| `options.extractorOptions?` | `any`                                                                                                                                       | Options for the EntityExtractor |
| `options.maxResults?`       | `number`                                                                                                                                    | Maximum results to return       |
| `options.textWeight?`       | `number`                                                                                                                                    | Weight for text-overlap score   |
| `options.traversalDepth?`   | `number`                                                                                                                                    | Graph traversal depth           |

#### Returns

`GraphRetriever`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                    | Type                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| <a id="property-config"></a> `config`       | `any`                                                                            |
| <a id="property-documents"></a> `documents` | `Map`\<`string`, \{ `content`: `string`; `id`: `string`; `metadata`: `any`; \}\> |
| <a id="property-extractor"></a> `extractor` | [`EntityExtractor`](EntityExtractor.md)                                          |
| <a id="property-graph"></a> `graph`         | [`KnowledgeGraph`](KnowledgeGraph.md)                                            |
| <a id="property-index"></a> `index`         | [`GraphIndex`](GraphIndex.md)                                                    |

## Methods

### clear()

```ts
clear(): void;
```

Clear all stored data, the graph, and indexes.

#### Returns

`void`

---

### getGraphStats()

```ts
getGraphStats(): object;
```

Return basic graph statistics.

#### Returns

`object`

##### entityCount

```ts
entityCount: number;
```

##### relationshipCount

```ts
relationshipCount: number;
```

---

### retrieve()

```ts
retrieve(queryOrObj, k?): Promise<object[]>;
```

Retrieve documents relevant to a query using graph + text scoring.

#### Parameters

| Parameter    | Type                                                       | Description                                     |
| ------------ | ---------------------------------------------------------- | ----------------------------------------------- |
| `queryOrObj` | \| `string` \| \{ `query`: `string`; `topK?`: `number`; \} | Query string or options object                  |
| `k?`         | `number`                                                   | Number of results (overrides config.maxResults) |

#### Returns

`Promise`\<`object`[]\>

---

### store()

```ts
store(documents): Promise<void>;
```

Store documents, extract entities and relationships, and build the graph.

#### Parameters

| Parameter   | Type       | Description |
| ----------- | ---------- | ----------- |
| `documents` | `object`[] | -           |

#### Returns

`Promise`\<`void`\>
