---
mdx:
  format: md
---

# Function: buildIDFWeights()

```ts
function buildIDFWeights(docs, options?): Map<string, number>;
```

Build IDF (Inverse Document Frequency) weights from a collection of documents.
IDF = log(1 + totalDocs / docsContainingToken). The +1 keeps weights
positive, so tokens found in every document (and every token when only one
document was retrieved) still count instead of weighing zero. Identical
documents (the same text after normalisation) count once, so a duplicated
source doesn't move any weight (3.9, BH-7).

With `options.sentence`, only the documents sharing a content word with
that sentence count (3.9, BH-7): a source that shares nothing with a
sentence can't move its score, and only the sentence's own words get a
weight. CitationTracker, checkAnswer and computeFaithfulness weight each
sentence this way.

## Parameters

| Parameter           | Type                         | Description               |
| ------------------- | ---------------------------- | ------------------------- |
| `docs`              | `object`[]                   | Array of document objects |
| `options?`          | \{ `sentence?`: `string`; \} | -                         |
| `options.sentence?` | `string`                     | -                         |

## Returns

`Map`\<`string`, `number`\>

Map of token to IDF weight
