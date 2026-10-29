---
mdx:
  format: md
---

# Interface: StreamChunk

One chunk of a streamed answer. The last chunk has `done: true` and, when
requested, the run's `citations` and `evaluation`. Without an llm the
stream is a single done chunk carrying `results`.

## Properties

| Property                                       | Type                                |
| ---------------------------------------------- | ----------------------------------- |
| <a id="property-citations"></a> `citations?`   | `any`                               |
| <a id="property-done"></a> `done`              | `boolean`                           |
| <a id="property-evaluation"></a> `evaluation?` | `any`                               |
| <a id="property-results"></a> `results?`       | [`SearchResult`](SearchResult.md)[] |
| <a id="property-token"></a> `token`            | `string`                            |
