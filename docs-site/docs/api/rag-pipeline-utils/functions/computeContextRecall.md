---
mdx:
  format: md
---

# Function: computeContextRecall()

```ts
function computeContextRecall(referenceAnswer, retrievedDocs, options?): object;
```

Compute context recall: the fraction of the claims in a REFERENCE
(ground-truth) answer that the retrieved documents support. It measures
whether retrieval found everything needed to answer correctly; pass the
expected answer, not the generated one (scoring the generated answer
against the documents is faithfulness).

A claim is one sentence of the reference answer. It is supported when some
document scores at least `threshold` with computeSupportScore, including
the numeric consistency check.

## Parameters

| Parameter            | Type                          | Description                                                               |
| -------------------- | ----------------------------- | ------------------------------------------------------------------------- |
| `referenceAnswer`    | `string`                      | The reference (ground-truth) answer text                                  |
| `retrievedDocs`      | `object`[]                    | Array of retrieved documents                                              |
| `options?`           | \{ `threshold?`: `number`; \} | Configuration options                                                     |
| `options.threshold?` | `number`                      | Minimum share of a claim's content terms a doc must contain to support it |

## Returns

`object`

### details

```ts
details: object[];
```

### score

```ts
score: number;
```

### supportedClaims

```ts
supportedClaims: number;
```

### totalClaims

```ts
totalClaims: number;
```
