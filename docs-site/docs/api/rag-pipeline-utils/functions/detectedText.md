---
mdx:
  format: md
---

# Function: detectedText()

```ts
function detectedText(result): string[];
```

The strings PII detectors found in a PostGenerationGuard result, for
`PostGenerationGuard.redact(text, matches)`. The result keeps them in a
non-enumerable `matchedText`, so they don't appear in its JSON.

## Parameters

| Parameter | Type     | Description                                          |
| --------- | -------- | ---------------------------------------------------- |
| `result`  | `object` | A PostGenerationGuard check() or checkAsync() result |

## Returns

`string`[]
