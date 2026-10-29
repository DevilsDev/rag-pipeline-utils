---
mdx:
  format: md
---

# Function: createError()

```ts
function createError(code, context?, originalError?): EnhancedError;
```

Create an EnhancedError. Same as calling its constructor.

## Parameters

| Parameter        | Type                            | Description              |
| ---------------- | ------------------------------- | ------------------------ |
| `code`           | `string`                        | Error code               |
| `context?`       | \{ \[`x`: `string`\]: `any`; \} | Placeholder values       |
| `originalError?` | `Error`                         | Underlying error, if any |

## Returns

[`EnhancedError`](../classes/EnhancedError.md)

Enhanced error instance
