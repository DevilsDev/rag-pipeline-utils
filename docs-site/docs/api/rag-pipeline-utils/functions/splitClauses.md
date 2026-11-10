---
mdx:
  format: md
---

# Function: splitClauses()

```ts
function splitClauses(text): string[][];
```

Split a sentence into clauses as the polarity check reads them: at
commas, semicolons, colons and brackets, and at but, whereas, although,
though, while, however, yet, and, or, except and unlike (left out). Each
clause is its tokens (see tokenize). The text is normalised first.

## Parameters

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `text`    | `string` | -           |

## Returns

`string`[][]
