---
mdx:
  format: md
---

# Interface: Logger

The interface of the `logger` export's methods and of `logger.logger`.

## Methods

### debug()

```ts
debug(message, meta?): void;
```

Logs at debug level.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `message` | `string` |
| `meta?`   | `any`    |

#### Returns

`void`

---

### error()

```ts
error(message, meta?): void;
```

Logs at error level.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `message` | `string` |
| `meta?`   | `any`    |

#### Returns

`void`

---

### info()

```ts
info(message, meta?): void;
```

Logs at info level; `meta` may be an object, an Error or a value.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `message` | `string` |
| `meta?`   | `any`    |

#### Returns

`void`

---

### warn()

```ts
warn(message, meta?): void;
```

Logs at warn level.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `message` | `string` |
| `meta?`   | `any`    |

#### Returns

`void`
