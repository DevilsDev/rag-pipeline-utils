---
mdx:
  format: md
---

# Class: ParallelProcessor

## Constructors

### Constructor

```ts
new ParallelProcessor(options?): ParallelProcessor;
```

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `options?` | `any` |

#### Returns

`ParallelProcessor`

## Methods

### process()

```ts
process(items, handler): Promise<any[]>;
```

#### Parameters

| Parameter | Type                           |
| --------- | ------------------------------ |
| `items`   | `any`[]                        |
| `handler` | (`item`) => `Promise`\<`any`\> |

#### Returns

`Promise`\<`any`[]\>
