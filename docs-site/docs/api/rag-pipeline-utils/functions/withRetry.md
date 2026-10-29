---
mdx:
  format: md
---

# Function: withRetry()

```ts
function withRetry<T>(fn, options?): Promise<T>;
```

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter              | Type                                                                      |
| ---------------------- | ------------------------------------------------------------------------- |
| `fn`                   | () => `Promise`\<`T`\>                                                    |
| `options?`             | \{ `backoff?`: `number`; `delay?`: `number`; `maxAttempts?`: `number`; \} |
| `options.backoff?`     | `number`                                                                  |
| `options.delay?`       | `number`                                                                  |
| `options.maxAttempts?` | `number`                                                                  |

## Returns

`Promise`\<`T`\>
