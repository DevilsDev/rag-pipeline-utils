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

| Parameter               | Type                                                                                                                          | Description                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `sentence`              | `string`                                                                                                                      | The sentence to map                                                                                  |
| `docs`                  | `object`[]                                                                                                                    | Source documents                                                                                     |
| `options?`              | \{ `answerText?`: `string`; `idfWeights?`: `Map`\<`string`, `number`\>; `maxCitations?`: `number`; `threshold?`: `number`; \} | Configuration options                                                                                |
| `options.answerText?`   | `string`                                                                                                                      | The whole answer the sentence comes from: a condition it restates in another sentence counts as kept |
| `options.idfWeights?`   | `Map`\<`string`, `number`\>                                                                                                   | Optional IDF weights for weighted similarity                                                         |
| `options.maxCitations?` | `number`                                                                                                                      | Maximum number of citations to return                                                                |
| `options.threshold?`    | `number`                                                                                                                      | Minimum similarity threshold                                                                         |

## Returns

`object`[]
