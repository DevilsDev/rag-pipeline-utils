---
mdx:
  format: md
---

# Function: withRetry()

```ts
function withRetry(_fn, fn?): Promise<any>;
```

Older wrapper around retry(): retries `fn` with exponential backoff from
`initialDelay` ms and logs each retry and the final failure under `label`.

## Parameters

| Parameter          | Type                                                                       | Description                                  |
| ------------------ | -------------------------------------------------------------------------- | -------------------------------------------- |
| `_fn`              | `any`                                                                      | -                                            |
| `fn?`              | \{ `initialDelay?`: `number`; `label?`: `string`; `retries?`: `number`; \} | The operation; called with the attempt index |
| `fn.initialDelay?` | `number`                                                                   | -                                            |
| `fn.label?`        | `string`                                                                   | -                                            |
| `fn.retries?`      | `number`                                                                   | -                                            |

## Returns

`Promise`\<`any`\>

The operation's result
