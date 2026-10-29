---
mdx:
  format: md
---

# Interface: Pipeline

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

#### Returns

`void`

---

### run()

```ts
run(options): Promise<PipelineRunResult>;
```

#### Parameters

| Parameter | Type                                          |
| --------- | --------------------------------------------- |
| `options` | [`PipelineRunOptions`](PipelineRunOptions.md) |

#### Returns

`Promise`\<[`PipelineRunResult`](PipelineRunResult.md)\>
