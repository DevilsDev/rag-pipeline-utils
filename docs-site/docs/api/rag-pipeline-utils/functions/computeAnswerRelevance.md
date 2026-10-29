---
mdx:
  format: md
---

# Function: computeAnswerRelevance()

```ts
function computeAnswerRelevance(query, answer, options?): object;
```

Compute answer relevance score measuring how well the answer addresses the query.
Combines Jaccard similarity with query token coverage for a balanced metric.

## Parameters

| Parameter                 | Type                                                           | Description                               |
| ------------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| `query`                   | `string`                                                       | The user query                            |
| `answer`                  | `string`                                                       | The generated answer text                 |
| `options?`                | \{ `coverageWeight?`: `number`; `jaccardWeight?`: `number`; \} | Configuration options                     |
| `options.coverageWeight?` | `number`                                                       | Weight for query token coverage component |
| `options.jaccardWeight?`  | `number`                                                       | Weight for Jaccard similarity component   |

## Returns

`object`

### jaccardSimilarity

```ts
jaccardSimilarity: number;
```

### missingQueryTerms

```ts
missingQueryTerms: string[];
```

### queryTokensCovered

```ts
queryTokensCovered: number;
```

### score

```ts
score: number;
```

### totalQueryTokens

```ts
totalQueryTokens: number;
```
