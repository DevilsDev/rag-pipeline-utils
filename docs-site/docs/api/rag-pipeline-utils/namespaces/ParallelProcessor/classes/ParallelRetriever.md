---
mdx:
  format: md
---

# Class: ParallelRetriever

Parallel processor for retrieval operations

## Constructors

### Constructor

```ts
new ParallelRetriever(retriever, _options?): ParallelRetriever;
```

#### Parameters

| Parameter   | Type  |
| ----------- | ----- |
| `retriever` | `any` |
| `_options?` | \{ \} |

#### Returns

`ParallelRetriever`

## Properties

| Property                                              | Type  |
| ----------------------------------------------------- | ----- |
| <a id="property-chunkqueries"></a> `chunkQueries`     | `any` |
| <a id="property-maxconcurrency"></a> `maxConcurrency` | `any` |
| <a id="property-retriever"></a> `retriever`           | `any` |

## Methods

### retrieveBatch()

```ts
retrieveBatch(queryVectors): Promise<any[]>;
```

Process multiple queries in parallel

#### Parameters

| Parameter      | Type         | Description            |
| -------------- | ------------ | ---------------------- |
| `queryVectors` | `number`[][] | Array of query vectors |

#### Returns

`Promise`\<`any`[]\>

Retrieved results
