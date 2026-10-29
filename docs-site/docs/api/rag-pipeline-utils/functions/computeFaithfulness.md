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

| Parameter            | Type                          | Description                                              |
| -------------------- | ----------------------------- | -------------------------------------------------------- |
| `answer`             | `string`                      | The generated answer text                                |
| `retrievedDocs`      | `object`[]                    | Array of retrieved documents with content                |
| `options?`           | \{ `threshold?`: `number`; \} | Configuration options                                    |
| `options.threshold?` | `number`                      | Minimum similarity score to consider a sentence faithful |

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
