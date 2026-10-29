---
mdx:
  format: md
---

# Function: formatErrorMessage()

```ts
function formatErrorMessage(error, options?): string;
```

Build a multi-line display string for an error. Fields the error lacks
(code, suggestions, documentation) are skipped.

## Parameters

| Parameter                       | Type                                                                                                                                                                                  | Description                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `error`                         | `Error` \| [`EnhancedError`](../classes/EnhancedError.md)                                                                                                                             | Error to format                        |
| `options?`                      | \{ `color?`: `boolean`; `includeCode?`: `boolean`; `includeContext?`: `boolean`; `includeDocumentation?`: `boolean`; `includeStack?`: `boolean`; `includeSuggestions?`: `boolean`; \} | Formatting options                     |
| `options.color?`                | `boolean`                                                                                                                                                                             | Accepted but unused                    |
| `options.includeCode?`          | `boolean`                                                                                                                                                                             | Prefix the message with the error code |
| `options.includeContext?`       | `boolean`                                                                                                                                                                             | List the context values as JSON        |
| `options.includeDocumentation?` | `boolean`                                                                                                                                                                             | Add the documentation URL              |
| `options.includeStack?`         | `boolean`                                                                                                                                                                             | Append the stack trace                 |
| `options.includeSuggestions?`   | `boolean`                                                                                                                                                                             | List the suggestions                   |

## Returns

`string`

Formatted error message
