---
mdx:
  format: md
---

# Interface: PipelineRunResult

## Properties

| Property                                 | Type                                              | Description                                                     |
| ---------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| <a id="property-cache"></a> `cache?`     | `object`                                          | Per-layer cache outcome; present when the pipeline has a cache. |
| `cache.embeddings?`                      | [`CacheOutcome`](../type-aliases/CacheOutcome.md) | -                                                               |
| `cache.generation?`                      | [`CacheOutcome`](../type-aliases/CacheOutcome.md) | -                                                               |
| `cache.retrieval?`                       | [`CacheOutcome`](../type-aliases/CacheOutcome.md) | -                                                               |
| <a id="property-error"></a> `error?`     | `string`                                          | -                                                               |
| <a id="property-query"></a> `query?`     | `string`                                          | -                                                               |
| <a id="property-results"></a> `results?` | `any`                                             | -                                                               |
| <a id="property-success"></a> `success`  | `boolean`                                         | -                                                               |
