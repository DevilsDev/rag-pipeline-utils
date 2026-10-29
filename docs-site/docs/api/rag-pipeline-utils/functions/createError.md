---
mdx:
  format: md
---

# Function: createError()

```ts
function createError(code, context?, originalError?): EnhancedError;
```

Creates an error whose message and suggestions come from the code's
template, with `{placeholders}` filled from `context`.

## Parameters

| Parameter        | Type                        | Description                                       |
| ---------------- | --------------------------- | ------------------------------------------------- |
| `code`           | `string`                    | One of [ERROR_CODES](../variables/ERROR_CODES.md) |
| `context?`       | `Record`\<`string`, `any`\> | Values for the message template's placeholders    |
| `originalError?` | `Error`                     | The underlying error, kept as `originalError`     |

## Returns

[`EnhancedError`](../interfaces/EnhancedError.md)
