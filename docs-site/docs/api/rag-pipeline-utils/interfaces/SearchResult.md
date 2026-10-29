---
mdx:
  format: md
---

# Interface: SearchResult

A retrieved document, as the built-in retrievers return it.

## Indexable

```ts
[key: string]: any
```

## Properties

| Property                                   | Type                        | Description                   |
| ------------------------------------------ | --------------------------- | ----------------------------- |
| <a id="property-content"></a> `content?`   | `string`                    | -                             |
| <a id="property-id"></a> `id`              | `string`                    | -                             |
| <a id="property-metadata"></a> `metadata?` | `Record`\<`string`, `any`\> | -                             |
| <a id="property-score"></a> `score`        | `number`                    | Similarity; higher is closer. |
