---
mdx:
  format: md
---

# Function: reciprocalRankFusion()

```ts
function reciprocalRankFusion(resultSets, options?): any[];
```

Reciprocal Rank Fusion - merges multiple ranked result lists

## Parameters

| Parameter    | Type      | Description                                              |
| ------------ | --------- | -------------------------------------------------------- |
| `resultSets` | `any`[][] | Array of result arrays, each result has {id, score, ...} |
| `options?`   | `object`  | {k: 60, weights: number[] (per result set)}              |

## Returns

`any`[]

Fused, deduplicated, sorted results
