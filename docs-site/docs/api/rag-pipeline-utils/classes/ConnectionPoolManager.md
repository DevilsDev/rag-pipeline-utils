---
mdx:
  format: md
---

# Class: ConnectionPoolManager

## Constructors

### Constructor

```ts
new ConnectionPoolManager(options?): ConnectionPoolManager;
```

#### Parameters

| Parameter                 | Type                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `options?`                | \{ \[`key`: `string`\]: `any`; `maxFreeSockets?`: `number`; `maxSockets?`: `number`; `timeout?`: `number`; \} |
| `options.maxFreeSockets?` | `number`                                                                                                      |
| `options.maxSockets?`     | `number`                                                                                                      |
| `options.timeout?`        | `number`                                                                                                      |

#### Returns

`ConnectionPoolManager`

## Methods

### destroy()

```ts
destroy(): void;
```

#### Returns

`void`

---

### getMetrics()

```ts
getMetrics(): any;
```

#### Returns

`any`

---

### getPool()

```ts
getPool(hostname): any;
```

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `hostname` | `string` |

#### Returns

`any`
