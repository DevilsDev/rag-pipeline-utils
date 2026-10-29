---
mdx:
  format: md
---

# Class: BatchProcessor

## Constructors

### Constructor

```ts
new BatchProcessor(options?): BatchProcessor;
```

#### Parameters

| Parameter                | Type                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options?`               | \{ \[`key`: `string`\]: `any`; `batchSize?`: `number`; `maxConcurrent?`: `number`; `onProgress?`: (`progress`) => `void`; `retryAttempts?`: `number`; \} |
| `options.batchSize?`     | `number`                                                                                                                                                 |
| `options.maxConcurrent?` | `number`                                                                                                                                                 |
| `options.onProgress?`    | (`progress`) => `void`                                                                                                                                   |
| `options.retryAttempts?` | `number`                                                                                                                                                 |

#### Returns

`BatchProcessor`

## Methods

### cancel()

```ts
cancel(): void;
```

#### Returns

`void`

---

### process()

```ts
process(items, handler): Promise<any[]>;
```

#### Parameters

| Parameter | Type                              |
| --------- | --------------------------------- |
| `items`   | `any`[]                           |
| `handler` | (`batch`) => `Promise`\<`any`[]\> |

#### Returns

`Promise`\<`any`[]\>
