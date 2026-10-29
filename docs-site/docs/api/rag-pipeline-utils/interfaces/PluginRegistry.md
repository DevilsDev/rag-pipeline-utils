---
mdx:
  format: md
---

# Interface: PluginRegistry

The interface of [pluginRegistry](../variables/pluginRegistry.md).

## Methods

### get()

```ts
get(type, name): any;
```

Returns a registered plugin; throws when it is not registered.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `type`    | `string` |
| `name`    | `string` |

#### Returns

`any`

---

### list()

```ts
list(type): string[];
```

The names registered for a type.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `type`    | `string` |

#### Returns

`string`[]

---

### register()

```ts
register(
   type,
   name,
   implementation,
   manifest?,
   options?
): Promise<PluginRegistry>;
```

Registers a plugin after checking it against its type's contract and,
when signature verification is enabled, its signed manifest.
Types: loader, embedder, retriever, reranker, llm, evaluator.

#### Parameters

| Parameter          | Type                     |
| ------------------ | ------------------------ |
| `type`             | `string`                 |
| `name`             | `string`                 |
| `implementation`   | `any`                    |
| `manifest?`        | `any`                    |
| `options?`         | \{ `content?`: `any`; \} |
| `options.content?` | `any`                    |

#### Returns

`Promise`\<`PluginRegistry`\>
