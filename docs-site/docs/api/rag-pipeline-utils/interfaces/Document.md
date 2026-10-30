---
mdx:
  format: md
---

# Interface: Document

A document as stored in a retriever.

## Properties

| Property                                   | Type                        | Description                                                      |
| ------------------------------------------ | --------------------------- | ---------------------------------------------------------------- |
| <a id="property-content"></a> `content`    | `string`                    | -                                                                |
| <a id="property-id"></a> `id`              | `string`                    | -                                                                |
| <a id="property-metadata"></a> `metadata?` | `Record`\<`string`, `any`\> | -                                                                |
| <a id="property-vector"></a> `vector?`     | `number`[]                  | The document's embedding (the built-in stores call it `vector`). |
