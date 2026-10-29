---
mdx:
  format: md
---

# Interface: CacheOptions

## Properties

| Property                                       | Type                                           | Description                                                          |
| ---------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| <a id="property-embeddings"></a> `embeddings?` | `boolean` \| [`CacheBackend`](CacheBackend.md) | -                                                                    |
| <a id="property-generation"></a> `generation?` | `boolean` \| [`CacheBackend`](CacheBackend.md) | -                                                                    |
| <a id="property-retrieval"></a> `retrieval?`   | `boolean` \| [`CacheBackend`](CacheBackend.md) | -                                                                    |
| <a id="property-ttlseconds"></a> `ttlSeconds?` | `object`                                       | Defaults: embeddings 30 days, retrieval 1 hour, generation 24 hours. |
| `ttlSeconds.embeddings?`                       | `number`                                       | -                                                                    |
| `ttlSeconds.generation?`                       | `number`                                       | -                                                                    |
| `ttlSeconds.retrieval?`                        | `number`                                       | -                                                                    |
