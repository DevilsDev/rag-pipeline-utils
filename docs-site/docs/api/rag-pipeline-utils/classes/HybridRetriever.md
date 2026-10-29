---
mdx:
  format: md
---

# Class: HybridRetriever

Runs several retrievers in parallel (for example vector and BM25) and
fuses their results with weighted reciprocal rank fusion.

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new HybridRetriever(retrievers?, options?): HybridRetriever;
```

#### Parameters

| Parameter     | Type       | Description |
| ------------- | ---------- | ----------- |
| `retrievers?` | `object`[] | -           |
| `options?`    | `object`   | -           |

#### Returns

`HybridRetriever`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                      | Type       |
| --------------------------------------------- | ---------- |
| <a id="property-config"></a> `config`         | `any`      |
| <a id="property-retrievers"></a> `retrievers` | `object`[] |

## Methods

### addRetriever()

```ts
addRetriever(
   retriever,
   weight?,
   name?
): void;
```

Add a retriever

#### Parameters

| Parameter   | Type     | Description                                 |
| ----------- | -------- | ------------------------------------------- |
| `retriever` | `object` | Object with .retrieve() or .search() method |
| `weight?`   | `number` | Weight for rank fusion                      |
| `name?`     | `string` | Name for this retriever                     |

#### Returns

`void`

---

### retrieve()

```ts
retrieve(query): Promise<any[]>;
```

Run all retrievers in parallel, fuse results

#### Parameters

| Parameter | Type     | Description                                            |
| --------- | -------- | ------------------------------------------------------ |
| `query`   | `object` | {query: string, queryVector?: number[], topK?: number} |

#### Returns

`Promise`\<`any`[]\>

Fused results
