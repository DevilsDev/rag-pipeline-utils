---
mdx:
  format: md
---

# Interface: RagPipelineConfig

Options for [createRagPipeline](../functions/createRagPipeline.md).

## Indexable

```ts
[key: string]: any
```

Other keys are ignored.

## Properties

| Property                                     | Type                                                                                   | Description                                                                                                                                                                                   |
| -------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="property-cache"></a> `cache?`         | \| `boolean` \| [`CacheBackend`](CacheBackend.md) \| [`CacheOptions`](CacheOptions.md) | Cache query embeddings, retrieval results and answers. `true` caches all three in memory; a CacheBackend (MemoryCache, RedisCache, your own) caches all three in it; or configure each layer. |
| <a id="property-embedder"></a> `embedder?`   | `string` \| [`EmbedderPlugin`](EmbedderPlugin.md)                                      | Embeds the query when `run()` gets a `query` and no `queryVector`.                                                                                                                            |
| <a id="property-llm"></a> `llm?`             | `string` \| [`LLMPlugin`](LLMPlugin.md)                                                | Writes the answer. Without one the pipeline is retrieval-only and `answer` is null.                                                                                                           |
| <a id="property-loader"></a> `loader?`       | `string` \| [`LoaderPlugin`](LoaderPlugin.md)                                          | Called with no arguments at the start of every run; its result is ignored.                                                                                                                    |
| <a id="property-registry"></a> `registry?`   | [`PluginRegistry`](PluginRegistry.md)                                                  | Resolves plugin names given as strings; defaults to the shared [pluginRegistry](../variables/pluginRegistry.md).                                                                              |
| <a id="property-reranker"></a> `reranker?`   | `string` \| [`RerankerPlugin`](RerankerPlugin.md)                                      | Reorders the retrieved documents before generation.                                                                                                                                           |
| <a id="property-retriever"></a> `retriever?` | `string` \| [`RetrieverPlugin`](RetrieverPlugin.md)                                    | Finds the documents for a query. Without one, every run retrieves nothing.                                                                                                                    |
| <a id="property-telemetry"></a> `telemetry?` | `boolean` \| [`TelemetryOptions`](TelemetryOptions.md)                                 | OpenTelemetry spans for every run and stage. `true` uses the global tracer provider. Needs the optional peer dependency `@opentelemetry/api`.                                                 |
