---
mdx:
  format: md
---

# Interface: RetrieveOptions

What the pipeline passes to [RetrieverPlugin.retrieve](RetrieverPlugin.md#retrieve).

## Properties

| Property                                         | Type          |
| ------------------------------------------------ | ------------- |
| <a id="property-query"></a> `query?`             | `string`      |
| <a id="property-queryvector"></a> `queryVector?` | `number`[]    |
| <a id="property-signal"></a> `signal?`           | `AbortSignal` |
| <a id="property-topk"></a> `topK`                | `number`      |
