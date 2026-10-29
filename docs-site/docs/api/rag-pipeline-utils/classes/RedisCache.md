---
mdx:
  format: md
---

# Class: RedisCache

CacheBackend on Redis. Pass a connected client from `redis` (node-redis 4
and later) or `ioredis`; neither is a dependency of this package.

Values are stored as JSON under `prefix + key`, with a millisecond expiry
when a time to live applies.

## Constructors

### Constructor

```ts
new RedisCache(options?): RedisCache;
```

#### Parameters

| Parameter             | Type                                                                 | Description                            |
| --------------------- | -------------------------------------------------------------------- | -------------------------------------- |
| `options?`            | \{ `client`: `any`; `prefix?`: `string`; `ttlSeconds?`: `number`; \} | -                                      |
| `options.client`      | `any`                                                                | Connected node-redis or ioredis client |
| `options.prefix?`     | `string`                                                             | Key prefix                             |
| `options.ttlSeconds?` | `number`                                                             | Default time to live                   |

#### Returns

`RedisCache`

## Properties

| Property                                      | Type     |
| --------------------------------------------- | -------- |
| <a id="property-client"></a> `client`         | `any`    |
| <a id="property-prefix"></a> `prefix`         | `string` |
| <a id="property-ttlseconds"></a> `ttlSeconds` | `number` |

## Methods

### delete()

```ts
delete(key): Promise<void>;
```

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
}>;
```

Hits and misses seen by this instance (size is not tracked).

#### Returns

`Promise`\<\{
`hits`: `number`;
`misses`: `number`;
\}\>
