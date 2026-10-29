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

Removes a key.

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

Resolves the stored value, or undefined when the key is missing or expired.

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

Stores a value, expiring it after `ttlSeconds` when given.

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

Backend-specific counters, such as size or hits.

#### Returns

`Promise`\<`Record`\<`string`, `number`\>\>
