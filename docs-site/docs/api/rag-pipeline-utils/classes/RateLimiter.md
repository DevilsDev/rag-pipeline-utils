---
mdx:
  format: md
---

# Class: RateLimiter

## Constructors

### Constructor

```ts
new RateLimiter(options?): RateLimiter;
```

#### Parameters

| Parameter              | Type                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `options?`             | \{ \[`key`: `string`\]: `any`; `maxRequests?`: `number`; `windowMs?`: `number`; \} |
| `options.maxRequests?` | `number`                                                                           |
| `options.windowMs?`    | `number`                                                                           |

#### Returns

`RateLimiter`

## Methods

### reset()

```ts
reset(identifier?): void;
```

#### Parameters

| Parameter     | Type     |
| ------------- | -------- |
| `identifier?` | `string` |

#### Returns

`void`

---

### tryAcquire()

```ts
tryAcquire(identifier?): boolean;
```

#### Parameters

| Parameter     | Type     |
| ------------- | -------- |
| `identifier?` | `string` |

#### Returns

`boolean`
