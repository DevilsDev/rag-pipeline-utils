---
mdx:
  format: md
---

# Interface: CacheBackend

A cache store: get / set / delete, optionally stats.

## Methods

### delete()?

```ts
delete?(key): Promise<void>;
```

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `key`     | `string` |

#### Returns

`Promise`\<`void`\>

---

### get()

```ts
get(key): Promise<unknown>;
```

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `key`     | `string` |

#### Returns

`Promise`\<`unknown`\>

---

### set()

```ts
set(
   key,
   value,
   options?
): Promise<void>;
```

#### Parameters

| Parameter             | Type                           |
| --------------------- | ------------------------------ |
| `key`                 | `string`                       |
| `value`               | `unknown`                      |
| `options?`            | \{ `ttlSeconds?`: `number`; \} |
| `options.ttlSeconds?` | `number`                       |

#### Returns

`Promise`\<`void`\>

---

### stats()?

```ts
stats?(): Promise<Record<string, number>>;
```

#### Returns

`Promise`\<`Record`\<`string`, `number`\>\>
