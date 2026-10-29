---
mdx:
  format: md
---

# Class: ScoringReranker

Reranks documents using BM25-like scoring with IDF weighting.
Implements the reranker contract: rerank(query, documents, options).

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new ScoringReranker(options?): ScoringReranker;
```

#### Parameters

| Parameter     | Type                                   | Description                         |
| ------------- | -------------------------------------- | ----------------------------------- |
| `options?`    | \{ `b?`: `number`; `k1?`: `number`; \} | -                                   |
| `options.b?`  | `number`                               | Length normalisation parameter      |
| `options.k1?` | `number`                               | Term frequency saturation parameter |

#### Returns

`ScoringReranker`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                              | Type     |
| ------------------------------------- | -------- |
| <a id="property-config"></a> `config` | `object` |
| `config.b`                            | `number` |
| `config.k1`                           | `number` |

## Methods

### rerank()

```ts
rerank(
   query,
   documents,
   options?
): Promise<object[]>;
```

Rerank documents against a query using BM25 scoring.

#### Parameters

| Parameter         | Type                                               | Description                                  |
| ----------------- | -------------------------------------------------- | -------------------------------------------- |
| `query`           | `string`                                           | The search query                             |
| `documents`       | (`string` \| `object`)[]                           | Documents to rerank                          |
| `options?`        | \{ `signal?`: `AbortSignal`; `topK?`: `number`; \} | -                                            |
| `options.signal?` | `AbortSignal`                                      | Rejects with AbortError when already aborted |
| `options.topK?`   | `number`                                           | Maximum number of results to return          |

#### Returns

`Promise`\<`object`[]\>

Reranked documents with .relevanceScore
