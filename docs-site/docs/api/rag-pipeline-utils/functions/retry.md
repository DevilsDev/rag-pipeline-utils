---
mdx:
  format: md
---

# Function: retry()

```ts
function retry<T>(fn, options?): Promise<T>;
```

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter              | Type                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `fn`                   | () => `Promise`\<`T`\>                                                                                        |
| `options?`             | \{ `backoff?`: `number`; `delay?`: `number`; `maxAttempts?`: `number`; `retryIf?`: (`error`) => `boolean`; \} |
| `options.backoff?`     | `number`                                                                                                      |
| `options.delay?`       | `number`                                                                                                      |
| `options.maxAttempts?` | `number`                                                                                                      |
| `options.retryIf?`     | (`error`) => `boolean`                                                                                        |

## Returns

`Promise`\<`T`\>
