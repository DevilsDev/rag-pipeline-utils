---
mdx:
  format: md
---

# Class: CascadeReranker

Chains multiple rerankers in sequence, passing the output of each
stage as input to the next. Implements the reranker contract:
rerank(query, documents, options).

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new CascadeReranker(rerankers?, options?): CascadeReranker;
```

#### Parameters

| Parameter    | Type       | Description                            |
| ------------ | ---------- | -------------------------------------- |
| `rerankers?` | `object`[] | Array of objects with .rerank() method |
| `options?`   | `object`   | -                                      |

#### Returns

`CascadeReranker`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                    | Type    |
| ------------------------------------------- | ------- |
| <a id="property-config"></a> `config`       | `any`   |
| <a id="property-rerankers"></a> `rerankers` | `any`[] |

## Methods

### addReranker()

```ts
addReranker(reranker): void;
```

Add a reranker to the end of the cascade.

#### Parameters

| Parameter  | Type     | Description                  |
| ---------- | -------- | ---------------------------- |
| `reranker` | `object` | Must have a .rerank() method |

#### Returns

`void`

---

### rerank()

```ts
rerank(
   query,
   documents,
   options?
): Promise<object[]>;
```

Run documents through each reranker in sequence.

#### Parameters

| Parameter         | Type                                               | Description                                      |
| ----------------- | -------------------------------------------------- | ------------------------------------------------ |
| `query`           | `string`                                           | The search query                                 |
| `documents`       | (`string` \| `object`)[]                           | Documents to rerank                              |
| `options?`        | \{ `signal?`: `AbortSignal`; `topK?`: `number`; \} | -                                                |
| `options.signal?` | `AbortSignal`                                      | Forwarded to every stage; checked between stages |
| `options.topK?`   | `number`                                           | Maximum number of results to return              |

#### Returns

`Promise`\<`object`[]\>

Reranked documents from the final stage

#### Throws

If no rerankers are configured
