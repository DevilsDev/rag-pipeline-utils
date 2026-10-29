---
mdx:
  format: md
---

# Interface: RagPipelineConfig

## Indexable

```ts
[key: string]: any
```

## Properties

| Property                                     | Type                                                                                   | Description                                                                                                                                                                                   |
| -------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="property-cache"></a> `cache?`         | \| `boolean` \| [`CacheBackend`](CacheBackend.md) \| [`CacheOptions`](CacheOptions.md) | Cache query embeddings, retrieval results and answers. `true` caches all three in memory; a CacheBackend (MemoryCache, RedisCache, your own) caches all three in it; or configure each layer. |
| <a id="property-embedder"></a> `embedder?`   | `string` \| [`EmbedderPlugin`](EmbedderPlugin.md)                                      | -                                                                                                                                                                                             |
| <a id="property-llm"></a> `llm?`             | `string` \| [`LLMPlugin`](LLMPlugin.md)                                                | -                                                                                                                                                                                             |
| <a id="property-loader"></a> `loader?`       | `string` \| [`LoaderPlugin`](LoaderPlugin.md)                                          | -                                                                                                                                                                                             |
| <a id="property-registry"></a> `registry?`   | [`PluginRegistry`](PluginRegistry.md)                                                  | -                                                                                                                                                                                             |
| <a id="property-reranker"></a> `reranker?`   | `string` \| [`RerankerPlugin`](RerankerPlugin.md)                                      | -                                                                                                                                                                                             |
| <a id="property-retriever"></a> `retriever?` | `string` \| [`RetrieverPlugin`](RetrieverPlugin.md)                                    | -                                                                                                                                                                                             |
