---
mdx:
  format: md
---

# Function: renderDetectorReport()

```ts
function renderDetectorReport(report, options?): string;
```

Render an evaluateDetectors() report as Markdown or a standalone HTML page.

## Parameters

| Parameter         | Type                                                                                                       | Description                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `report`          | `object`                                                                                                   | -                                  |
| `options?`        | \{ `format?`: `"markdown"` \| `"html"`; `min?`: \{ \[`x`: `string`\]: `number`; \}; `title?`: `string`; \} | -                                  |
| `options.format?` | `"markdown"` \| `"html"`                                                                                   | -                                  |
| `options.min?`    | \{ \[`x`: `string`\]: `number`; \}                                                                         | Minimums, as for detectorVerdict() |
| `options.title?`  | `string`                                                                                                   | -                                  |

## Returns

`string`
