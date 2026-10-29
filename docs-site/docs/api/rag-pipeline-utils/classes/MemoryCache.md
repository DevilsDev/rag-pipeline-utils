---
mdx:
  format: md
---

# Class: MemoryCache

In-process cache with least-recently-used eviction and per-entry time to
live. Implements the CacheBackend contract:

get(key) -> Promise<value | undefined>
set(key, value, { ttlSeconds }) -> Promise<void>
delete(key) -> Promise<void>
stats() -> Promise<{ hits, misses, size }>

Values are stored as JSON copies, so later changes to a returned value do
not change the cache (the same behaviour as RedisCache).

## Constructors

### Constructor

```ts
new MemoryCache(options?): MemoryCache;
```

#### Parameters

| Parameter             | Type                                                    | Description                                                        |
| --------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| `options?`            | \{ `maxEntries?`: `number`; `ttlSeconds?`: `number`; \} | -                                                                  |
| `options.maxEntries?` | `number`                                                | Entries kept before the least recently used is evicted             |
| `options.ttlSeconds?` | `number`                                                | Default time to live; none means entries never expire on their own |

#### Returns

`MemoryCache`

## Properties

| Property                                      | Type     |
| --------------------------------------------- | -------- |
| <a id="property-maxentries"></a> `maxEntries` | `number` |
| <a id="property-ttlseconds"></a> `ttlSeconds` | `number` |

## Methods

### clear()

```ts
clear(): Promise<void>;
```

Remove every entry.

#### Returns

`Promise`\<`void`\>

---

### delete()

```ts
delete(key): Promise<void>;
```

Removes a key.

#### Parameters

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `key`     | `string` | -           |

#### Returns

`Promise`\<`void`\>

---

### get()

```ts
get(key): Promise<unknown>;
```

#### Parameters

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `key`     | `string` | -           |

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

| Parameter             | Type                           | Description             |
| --------------------- | ------------------------------ | ----------------------- |
| `key`                 | `string`                       | -                       |
| `value`               | `unknown`                      | JSON-serialisable value |
| `options?`            | \{ `ttlSeconds?`: `number`; \} | -                       |
| `options.ttlSeconds?` | `number`                       | -                       |

#### Returns

`Promise`\<`void`\>

---

### stats()

```ts
stats(): Promise<{
  hits: number;
  misses: number;
  size: number;
}>;
```

#### Returns

`Promise`\<\{
`hits`: `number`;
`misses`: `number`;
`size`: `number`;
\}\>
