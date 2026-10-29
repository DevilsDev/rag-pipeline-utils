---
mdx:
  format: md
---

# Function: computeSemanticSimilarity()

```ts
function computeSemanticSimilarity(
  answer,
  reference,
  options?,
): Promise<number>;
```

## Parameters

| Parameter          | Type                                               | Description                                                                                                                                          |
| ------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `answer`           | `string`                                           | The generated answer                                                                                                                                 |
| `reference`        | `string`                                           | The reference (ground-truth) answer                                                                                                                  |
| `options?`         | \{ `embedder`: `any`; `signal?`: `AbortSignal`; \} | -                                                                                                                                                    |
| `options.embedder` | `any`                                              | Any embedder with embed() or embedQuery() (a built-in connector, LocalEmbedder fitted to your corpus, an AI SDK adapter, HashEmbedder from /testing) |
| `options.signal?`  | `AbortSignal`                                      | -                                                                                                                                                    |

## Returns

`Promise`\<`number`\>

Cosine similarity clamped to 0..1
