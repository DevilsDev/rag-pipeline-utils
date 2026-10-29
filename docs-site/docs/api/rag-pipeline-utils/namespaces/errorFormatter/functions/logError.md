---
mdx:
  format: md
---

# Function: logError()

```ts
function logError(error, logger?): void;
```

Format an error and write it to a logger. Warnings go to logger.warn,
everything else to logger.error; critical errors include the stack trace.
Errors that are not EnhancedError are treated as 'error'.

## Parameters

| Parameter | Type                                                      | Description        |
| --------- | --------------------------------------------------------- | ------------------ |
| `error`   | `Error` \| [`EnhancedError`](../classes/EnhancedError.md) | Error to log       |
| `logger?` | `Pick`\<`Console`, `"error"` \| `"warn"`\>                | Logger to write to |

## Returns

`void`
