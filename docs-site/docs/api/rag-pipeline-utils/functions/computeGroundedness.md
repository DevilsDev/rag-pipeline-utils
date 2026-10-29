---
mdx:
  format: md
---

# Function: computeGroundedness()

```ts
function computeGroundedness(query, answer, retrievedDocs, options?): object;
```

Compute a composite groundedness score from faithfulness, context precision
and (when a reference answer is given) context recall.

Formula: a weighted mean over the components that are available,

score = sum(w_i \* m_i) / sum(w_i)

With a reference answer and the default weights this is
0.4 _ faithfulness + 0.3 _ contextPrecision + 0.3 _ contextRecall.
Without one, context recall is left out and the remaining weights are
renormalised:
(0.4 _ faithfulness + 0.3 \* contextPrecision) / 0.7.
If every available weight is 0 the score is 0.

## Parameters

| Parameter                          | Type                                                                                                                                                              | Description                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `query`                            | `string`                                                                                                                                                          | The user query                                          |
| `answer`                           | `string`                                                                                                                                                          | The generated answer text                               |
| `retrievedDocs`                    | `object`[]                                                                                                                                                        | Array of retrieved documents                            |
| `options?`                         | \{ `referenceAnswer?`: `string`; `threshold?`: `number`; `weights?`: \{ `contextPrecision`: `number`; `contextRecall`: `number`; `faithfulness`: `number`; \}; \} | Configuration options                                   |
| `options.referenceAnswer?`         | `string`                                                                                                                                                          | Reference (ground-truth) answer used for context recall |
| `options.threshold?`               | `number`                                                                                                                                                          | Similarity threshold passed to component metrics        |
| `options.weights?`                 | \{ `contextPrecision`: `number`; `contextRecall`: `number`; `faithfulness`: `number`; \}                                                                          | Custom weights for each component                       |
| `options.weights.contextPrecision` | `number`                                                                                                                                                          | -                                                       |
| `options.weights.contextRecall`    | `number`                                                                                                                                                          | -                                                       |
| `options.weights.faithfulness`     | `number`                                                                                                                                                          | -                                                       |

## Returns

`object`

`components.contextRecall` is `{ score: null, skipped: true, reason }`
when no reference answer was given.

### components

```ts
components: object;
```

#### components.contextPrecision

```ts
contextPrecision: object;
```

#### components.contextRecall

```ts
contextRecall: object;
```

#### components.faithfulness

```ts
faithfulness: object;
```

### score

```ts
score: number;
```

### weights

```ts
weights: object;
```

#### weights.contextPrecision

```ts
contextPrecision: number;
```

#### weights.contextRecall

```ts
contextRecall: number;
```

#### weights.faithfulness

```ts
faithfulness: number;
```
