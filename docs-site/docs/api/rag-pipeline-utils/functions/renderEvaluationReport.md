---
mdx:
  format: md
---

# Function: renderEvaluationReport()

```ts
function renderEvaluationReport(input, options?): string;
```

Renders an evaluation run, and its comparison with a baseline if given,
as Markdown (for a pull request comment) or a standalone HTML page.

## Parameters

| Parameter           | Type                                                                                     | Description                      |
| ------------------- | ---------------------------------------------------------------------------------------- | -------------------------------- |
| `input`             | \{ `comparison?`: `any`; `min?`: \{ \[`x`: `string`\]: `number`; \}; `report`: `any`; \} | -                                |
| `input.comparison?` | `any`                                                                                    | A compareConfigurations() result |
| `input.min?`        | \{ \[`x`: `string`\]: `number`; \}                                                       | Minimum mean per metric          |
| `input.report`      | `any`                                                                                    | A runEvaluation() report         |
| `options?`          | \{ `format?`: `"markdown"` \| `"html"`; `title?`: `string`; \}                           | -                                |
| `options.format?`   | `"markdown"` \| `"html"`                                                                 | -                                |
| `options.title?`    | `string`                                                                                 | -                                |

## Returns

`string`
