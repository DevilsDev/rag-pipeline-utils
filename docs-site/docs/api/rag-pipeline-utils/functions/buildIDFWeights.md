---
mdx:
  format: md
---

# Function: buildIDFWeights()

```ts
function buildIDFWeights(docs): Map<string, number>;
```

Build IDF (Inverse Document Frequency) weights from a collection of documents.
IDF = log(1 + totalDocs / docsContainingToken). The +1 keeps weights
positive, so tokens found in every document (and every token when only one
document was retrieved) still count instead of weighing zero.

## Parameters

| Parameter | Type       | Description               |
| --------- | ---------- | ------------------------- |
| `docs`    | `object`[] | Array of document objects |

## Returns

`Map`\<`string`, `number`\>

Map of token to IDF weight
