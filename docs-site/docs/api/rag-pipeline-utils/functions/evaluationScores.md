---
mdx:
  format: md
---

# Function: evaluationScores()

```ts
function evaluationScores(result, options?): object[];
```

## Parameters

| Parameter               | Type                              | Description                                                                                                      |
| ----------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `result`                | `object`                          | A pipeline run result (or a stream's done chunk) with `evaluation` and/or `citations`, or a checkAnswer() result |
| `options?`              | \{ `explanations?`: `boolean`; \} | -                                                                                                                |
| `options.explanations?` | `boolean`                         | Include explanations, which quote the answer                                                                     |

## Returns

`object`[]
