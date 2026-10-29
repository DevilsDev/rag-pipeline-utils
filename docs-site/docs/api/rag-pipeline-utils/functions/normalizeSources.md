---
mdx:
  format: md
---

# Function: normalizeSources()

```ts
function normalizeSources(sources): object[];
```

Normalize sources to `{ id, content, metadata }`.

Accepts strings, `{ id, content }` (this library), LangChain Documents
(`{ pageContent, metadata }`), LlamaIndex nodes (`{ text }`) and
`NodeWithScore` (`{ node, score }`).

## Parameters

| Parameter | Type    | Description |
| --------- | ------- | ----------- |
| `sources` | `any`[] | -           |

## Returns

`object`[]
