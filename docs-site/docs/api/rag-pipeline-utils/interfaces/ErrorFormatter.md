---
mdx:
  format: md
---

# Interface: ErrorFormatter

## Properties

| Property                                        | Type                           |
| ----------------------------------------------- | ------------------------------ |
| <a id="property-error_codes"></a> `ERROR_CODES` | `Record`\<`string`, `string`\> |

## Methods

### createError()

```ts
createError(
   code,
   message,
   details?
): Error;
```

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `code`     | `string` |
| `message`  | `string` |
| `details?` | `any`    |

#### Returns

`Error`

---

### formatError()

```ts
formatError(error): string;
```

#### Parameters

| Parameter | Type    |
| --------- | ------- |
| `error`   | `Error` |

#### Returns

`string`

---

### wrapError()

```ts
wrapError(error, context): Error;
```

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `error`   | `Error`  |
| `context` | `string` |

#### Returns

`Error`
