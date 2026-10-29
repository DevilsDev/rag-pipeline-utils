---
mdx:
  format: md
---

# Class: Semaphore

Semaphore for controlling concurrent operations

## Constructors

### Constructor

```ts
new Semaphore(maxConcurrency): Semaphore;
```

#### Parameters

| Parameter        | Type  |
| ---------------- | ----- |
| `maxConcurrency` | `any` |

#### Returns

`Semaphore`

## Properties

| Property                                              | Type     |
| ----------------------------------------------------- | -------- |
| <a id="property-currentcount"></a> `currentCount`     | `number` |
| <a id="property-maxconcurrency"></a> `maxConcurrency` | `any`    |
| <a id="property-waitqueue"></a> `waitQueue`           | `any`[]  |

## Methods

### acquire()

```ts
acquire(): Promise<any>;
```

Resolves when a slot is free and takes it.

#### Returns

`Promise`\<`any`\>

---

### release()

```ts
release(): void;
```

Frees a slot, starting the next waiter if there is one.

#### Returns

`void`
