---
mdx:
  format: md
---

# Interface: Pipeline

A pipeline returned by [createRagPipeline](../functions/createRagPipeline.md).

## Methods

### cacheStats()

```ts
cacheStats(): object;
```

Hits, misses and skips per cache layer; null without a cache.

#### Returns

`object`

##### embeddings?

```ts
embeddings?: CacheLayerStats;
```

##### generation?

```ts
generation?: CacheLayerStats;
```

##### retrieval?

```ts
retrieval?: CacheLayerStats;
```

---

### cleanup()

```ts
cleanup(): void;
```

Does nothing; kept for compatibility.

#### Returns

`void`

---

### run()

#### Call Signature

```ts
run(options): Promise<
  | PipelineRunResult
| AsyncIterable<StreamChunk, any, any>>;
```

Answer one query: (embed) → retrieve → (filter) → (rerank) → generate →
(citations, evaluation). Resolves a [PipelineRunResult](PipelineRunResult.md), or with
`options.stream` an async iterable of [StreamChunk](StreamChunk.md).

##### Parameters

| Parameter | Type                                                     |
| --------- | -------------------------------------------------------- |
| `options` | [`PipelineRunOptions`](PipelineRunOptions.md) & `object` |

##### Returns

`Promise`\<
\| [`PipelineRunResult`](PipelineRunResult.md)
\| `AsyncIterable`\<[`StreamChunk`](StreamChunk.md), `any`, `any`\>\>

#### Call Signature

```ts
run(options?): Promise<PipelineRunResult>;
```

Answer one query; see the streaming overload above.

##### Parameters

| Parameter  | Type                                                     |
| ---------- | -------------------------------------------------------- |
| `options?` | [`PipelineRunOptions`](PipelineRunOptions.md) & `object` |

##### Returns

`Promise`\<[`PipelineRunResult`](PipelineRunResult.md)\>

#### Call Signature

```ts
run(options?): Promise<
  | PipelineRunResult
| AsyncIterable<StreamChunk, any, any>>;
```

Answer one query; with `options.stream` it may resolve a stream.

##### Parameters

| Parameter  | Type                                          |
| ---------- | --------------------------------------------- |
| `options?` | [`PipelineRunOptions`](PipelineRunOptions.md) |

##### Returns

`Promise`\<
\| [`PipelineRunResult`](PipelineRunResult.md)
\| `AsyncIterable`\<[`StreamChunk`](StreamChunk.md), `any`, `any`\>\>
