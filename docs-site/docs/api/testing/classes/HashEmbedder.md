---
mdx:
  format: md
---

# Class: HashEmbedder

Deterministic embedder: hashed bag of words, L2-normalised. Texts that
share words get similar vectors, so retrieval ranks sensibly in tests.

## Constructors

### Constructor

```ts
new HashEmbedder(options?): HashEmbedder;
```

#### Parameters

| Parameter             | Type                           | Description   |
| --------------------- | ------------------------------ | ------------- |
| `options?`            | \{ `dimensions?`: `number`; \} | -             |
| `options.dimensions?` | `number`                       | Vector length |

#### Returns

`HashEmbedder`

## Properties

| Property                                      | Type     |
| --------------------------------------------- | -------- |
| <a id="property-dimensions"></a> `dimensions` | `number` |
| <a id="property-metadata"></a> `metadata`     | `object` |
| `metadata.name`                               | `string` |
| `metadata.type`                               | `string` |
| `metadata.version`                            | `string` |

## Methods

### embed()

```ts
embed(text, options?): Promise<number[]>;
```

#### Parameters

| Parameter         | Type                            | Description |
| ----------------- | ------------------------------- | ----------- |
| `text`            | `string`                        | -           |
| `options?`        | \{ `signal?`: `AbortSignal`; \} | -           |
| `options.signal?` | `AbortSignal`                   | -           |

#### Returns

`Promise`\<`number`[]\>

---

### embedBatch()

```ts
embedBatch(texts, options?): Promise<number[][]>;
```

#### Parameters

| Parameter         | Type                            | Description |
| ----------------- | ------------------------------- | ----------- |
| `texts`           | `string`[]                      | -           |
| `options?`        | \{ `signal?`: `AbortSignal`; \} | -           |
| `options.signal?` | `AbortSignal`                   | -           |

#### Returns

`Promise`\<`number`[][]\>

---

### embedQuery()

```ts
embedQuery(text, options?): Promise<number[]>;
```

Same as embed().

#### Parameters

| Parameter         | Type                            | Description |
| ----------------- | ------------------------------- | ----------- |
| `text`            | `string`                        | -           |
| `options?`        | \{ `signal?`: `AbortSignal`; \} | -           |
| `options.signal?` | `AbortSignal`                   | -           |

#### Returns

`Promise`\<`number`[]\>

---

### getCacheKey()

```ts
getCacheKey(role): string;
```

Cache identity for createRagPipeline({ cache }).

#### Parameters

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `role`    | `string` | -           |

#### Returns

`string`
