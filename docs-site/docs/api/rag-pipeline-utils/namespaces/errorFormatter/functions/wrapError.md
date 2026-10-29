---
mdx:
  format: md
---

# Function: wrapError()

```ts
function wrapError(error, code, context?): EnhancedError;
```

Wrap an existing error in an EnhancedError. The original message is added
to the context as originalMessage and the error is kept as originalError.

## Parameters

| Parameter  | Type                            | Description                   |
| ---------- | ------------------------------- | ----------------------------- |
| `error`    | `Error`                         | Original error                |
| `code`     | `string`                        | Error code                    |
| `context?` | \{ \[`x`: `string`\]: `any`; \} | Additional placeholder values |

## Returns

[`EnhancedError`](../classes/EnhancedError.md)

Enhanced error
