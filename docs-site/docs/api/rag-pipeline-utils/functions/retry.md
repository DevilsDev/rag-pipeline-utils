---
mdx:
  format: md
---

# Function: retry()

```ts
function retry(fn, opts?): Promise<any>;
```

Retry a function with exponential backoff.

## Parameters

| Parameter          | Type                                                                                                                                             | Description                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `fn`               | `Function`                                                                                                                                       | async or sync function to call; receives (attempt)   |
| `opts?`            | \{ `baseDelay?`: `number`; `jitter?`: `boolean`; `multiplier?`: `number`; `onDelay?`: `Function`; `retries?`: `number`; `sleep?`: `Function`; \} | -                                                    |
| `opts.baseDelay?`  | `number`                                                                                                                                         | initial delay in ms                                  |
| `opts.jitter?`     | `boolean`                                                                                                                                        | add +/-50% jitter if true                            |
| `opts.multiplier?` | `number`                                                                                                                                         | backoff multiplier                                   |
| `opts.onDelay?`    | `Function`                                                                                                                                       | callback (delayMs, attempt, error) before each sleep |
| `opts.retries?`    | `number`                                                                                                                                         | number of _retries_ (total attempts = retries + 1)   |
| `opts.sleep?`      | `Function`                                                                                                                                       | injected sleeper for tests                           |

## Returns

`Promise`\<`any`\>
