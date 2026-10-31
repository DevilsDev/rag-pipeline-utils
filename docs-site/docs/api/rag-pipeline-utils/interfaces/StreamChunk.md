---
mdx:
  format: md
---

# Interface: StreamChunk

One chunk of a streamed answer. The last chunk has `done: true` and, when
requested, the run's `citations` and `evaluation`. Without an llm the
stream is a single done chunk carrying `results`.

## Properties

| Property                                       | Type                                  | Description                                            |
| ---------------------------------------------- | ------------------------------------- | ------------------------------------------------------ |
| <a id="property-citations"></a> `citations?`   | `any`                                 | -                                                      |
| <a id="property-done"></a> `done`              | `boolean`                             | -                                                      |
| <a id="property-evaluation"></a> `evaluation?` | `any`                                 | -                                                      |
| <a id="property-packing"></a> `packing?`       | [`ContextPacking`](ContextPacking.md) | On the last chunk, when `maxContextTokens` was set.    |
| <a id="property-results"></a> `results?`       | [`SearchResult`](SearchResult.md)[]   | -                                                      |
| <a id="property-timing"></a> `timing?`         | [`StreamTiming`](StreamTiming.md)     | On the last chunk: time to first token and total time. |
| <a id="property-token"></a> `token`            | `string`                              | -                                                      |
