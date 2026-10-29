---
mdx:
  format: md
---

# Class: JWTValidator

## Constructors

### Constructor

```ts
new JWTValidator(options?): JWTValidator;
```

#### Parameters

| Parameter                 | Type                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options?`                | \{ \[`key`: `string`\]: `any`; `algorithms?`: `string`[]; `audience?`: `string`; `clockTolerance?`: `number`; `issuer?`: `string`; `maxAge?`: `string`; `secret?`: `string`; \} |
| `options.algorithms?`     | `string`[]                                                                                                                                                                      |
| `options.audience?`       | `string`                                                                                                                                                                        |
| `options.clockTolerance?` | `number`                                                                                                                                                                        |
| `options.issuer?`         | `string`                                                                                                                                                                        |
| `options.maxAge?`         | `string`                                                                                                                                                                        |
| `options.secret?`         | `string`                                                                                                                                                                        |

#### Returns

`JWTValidator`

## Methods

### sign()

```ts
sign(payload, options?): string;
```

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `payload`  | `any` |
| `options?` | `any` |

#### Returns

`string`

---

### verify()

```ts
verify(token, options?): any;
```

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `token`    | `string` |
| `options?` | `any`    |

#### Returns

`any`
