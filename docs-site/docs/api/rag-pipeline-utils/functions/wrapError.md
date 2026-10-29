---
mdx:
  format: md
---

# Function: wrapError()

```ts
function wrapError(error, code, context?): EnhancedError;
```

Wraps an error in an EnhancedError with the given code, keeping the
original as `originalError` and its message as `context.originalMessage`.

## Parameters

| Parameter  | Type                        | Description                                       |
| ---------- | --------------------------- | ------------------------------------------------- |
| `error`    | `Error`                     | The error to wrap                                 |
| `code`     | `string`                    | One of [ERROR_CODES](../variables/ERROR_CODES.md) |
| `context?` | `Record`\<`string`, `any`\> | Values for the message template's placeholders    |

## Returns

[`EnhancedError`](../interfaces/EnhancedError.md)
