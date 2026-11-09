---
mdx:
  format: md
---

# Function: computeFaithfulness()

```ts
function computeFaithfulness(answer, retrievedDocs, options?): object;
```

Compute faithfulness score for an answer against retrieved documents.
Measures how well each sentence in the answer is supported by the retrieved context.

## Parameters

| Parameter                  | Type                                                                                       | Description                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `answer`                   | `string`                                                                                   | The generated answer text                                                                                            |
| `retrievedDocs`            | `object`[]                                                                                 | Array of retrieved documents with content                                                                            |
| `options?`                 | \{ `conditionCheck?`: `boolean`; `threshold?`: `number`; `useIDFWeighting?`: `boolean`; \} | Configuration options                                                                                                |
| `options.conditionCheck?`  | `boolean`                                                                                  | false: skip the 3.9 condition check (see computeSupportScore)                                                        |
| `options.threshold?`       | `number`                                                                                   | Minimum similarity score to consider a sentence faithful                                                             |
| `options.useIDFWeighting?` | `boolean`                                                                                  | Weight words by IDF over the documents, as CitationTracker and checkAnswer do (3.9), so they agree on every sentence |

## Returns

`object`

### details

```ts
details: object[];
```

### faithfulSentences

```ts
faithfulSentences: number;
```

### score

```ts
score: number;
```

### totalSentences

```ts
totalSentences: number;
```
