---
mdx:
  format: md
---

# Interface: EmbedderPlugin

An embedder. To register it with pluginRegistry it needs `metadata: { name, version, type: "embedder" }`.

## Methods

### embed()

```ts
embed(text, options?):
  | EmbeddingOutput
| Promise<EmbeddingOutput>;
```

Embeds one text. Used for the query when `embedQuery` is absent.

#### Parameters

| Parameter         | Type                                                        |
| ----------------- | ----------------------------------------------------------- |
| `text`            | `string`                                                    |
| `options?`        | \{ \[`key`: `string`\]: `any`; `signal?`: `AbortSignal`; \} |
| `options.signal?` | `AbortSignal`                                               |

#### Returns

\| [`EmbeddingOutput`](../type-aliases/EmbeddingOutput.md)
\| `Promise`\<[`EmbeddingOutput`](../type-aliases/EmbeddingOutput.md)\>

---

### embedQuery()?

```ts
embedQuery?(text, options?):
  | EmbeddingOutput
| Promise<EmbeddingOutput>;
```

Embeds a query; preferred over `embed` when present.

#### Parameters

| Parameter         | Type                                                        |
| ----------------- | ----------------------------------------------------------- |
| `text`            | `string`                                                    |
| `options?`        | \{ \[`key`: `string`\]: `any`; `signal?`: `AbortSignal`; \} |
| `options.signal?` | `AbortSignal`                                               |

#### Returns

\| [`EmbeddingOutput`](../type-aliases/EmbeddingOutput.md)
\| `Promise`\<[`EmbeddingOutput`](../type-aliases/EmbeddingOutput.md)\>
