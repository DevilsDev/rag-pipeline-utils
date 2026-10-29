---
mdx:
  format: md
---

# Function: computeContextPrecision()

```ts
function computeContextPrecision(query, retrievedDocs, options?): object;
```

Compute context precision: the fraction of retrieved documents that are relevant to the query.

## Parameters

| Parameter            | Type                          | Description                                                                       |
| -------------------- | ----------------------------- | --------------------------------------------------------------------------------- |
| `query`              | `string`                      | The user query                                                                    |
| `retrievedDocs`      | `object`[]                    | Array of retrieved documents                                                      |
| `options?`           | \{ `threshold?`: `number`; \} | Configuration options                                                             |
| `options.threshold?` | `number`                      | Minimum share of query content terms a doc must contain to be considered relevant |

## Returns

`object`

### perDocScores

```ts
perDocScores: object[];
```

### relevantDocs

```ts
relevantDocs: number;
```

### score

```ts
score: number;
```

### totalDocs

```ts
totalDocs: number;
```
