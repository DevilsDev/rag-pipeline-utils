---
mdx:
  format: md
---

# Function: classifyQuery()

```ts
function classifyQuery(query): "simple" | "complex";
```

The default classifier: 'complex' for questions that ask for reasoning
(why, explain, compare, trade-offs, ...), ask several things at once or
are long; 'simple' otherwise. A heuristic: pass your own `classify` for
your traffic.

## Parameters

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `query`   | `string` | -           |

## Returns

`"simple"` \| `"complex"`
