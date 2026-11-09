---
mdx:
  format: md
---

# Function: mapSentenceToSources()

```ts
function mapSentenceToSources(sentence, docs, options?): object[];
```

Map a sentence to its most relevant source documents by how much of the
sentence each document supports (see computeSupportScore).

## Parameters

| Parameter                  | Type                                                                                                                                                                                                                               | Description                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `sentence`                 | `string`                                                                                                                                                                                                                           | The sentence to map                                                                                       |
| `docs`                     | `object`[]                                                                                                                                                                                                                         | Source documents                                                                                          |
| `options?`                 | \{ `answerText?`: `string`; `best?`: \{ `bestScore`: `number`; \}; `conditionCheck?`: `boolean`; `idfWeights?`: `Map`\<`string`, `number`\>; `maxCitations?`: `number`; `preparedSources?`: `object`[]; `threshold?`: `number`; \} | Configuration options                                                                                     |
| `options.answerText?`      | `string`                                                                                                                                                                                                                           | The whole answer the sentence comes from: a condition it restates in another sentence counts as kept      |
| `options.best?`            | \{ `bestScore`: `number`; \}                                                                                                                                                                                                       | Filled with the best score of any document, also when below the threshold (CitationTracker's near misses) |
| `options.best.bestScore`   | `number`                                                                                                                                                                                                                           | -                                                                                                         |
| `options.conditionCheck?`  | `boolean`                                                                                                                                                                                                                          | false: skip the condition check (see computeSupportScore)                                                 |
| `options.idfWeights?`      | `Map`\<`string`, `number`\>                                                                                                                                                                                                        | Optional IDF weights for weighted similarity                                                              |
| `options.maxCitations?`    | `number`                                                                                                                                                                                                                           | Maximum number of citations to return                                                                     |
| `options.preparedSources?` | `object`[]                                                                                                                                                                                                                         | prepareDocument() of each doc, in order, when the same docs are mapped for several sentences              |
| `options.threshold?`       | `number`                                                                                                                                                                                                                           | Minimum similarity threshold                                                                              |

## Returns

`object`[]
