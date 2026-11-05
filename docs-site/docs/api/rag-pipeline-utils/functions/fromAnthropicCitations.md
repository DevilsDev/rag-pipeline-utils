---
mdx:
  format: md
---

# Function: fromAnthropicCitations()

```ts
function fromAnthropicCitations(message, options?): ProviderCitations;
```

Normalise the citations of a Claude Messages API response.

Each text block that carries citations is a claim. Pass a stream's
final message (`stream.finalMessage()`).

## Parameters

| Parameter            | Type                            | Description                                                                                                                                                                                          |
| -------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message`            | `object`                        | The Message, as the SDK returns it or as JSON                                                                                                                                                        |
| `options?`           | \{ `documents?`: `object`[]; \} | -                                                                                                                                                                                                    |
| `options.documents?` | `object`[]                      | The request's document blocks in order (`document_index` counts them), as your own `{ id }` records, so citations name your ids; otherwise a citation is named by the document's title, or its index |

## Returns

`ProviderCitations`
