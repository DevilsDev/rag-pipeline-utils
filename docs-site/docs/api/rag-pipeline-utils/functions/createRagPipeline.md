---
mdx:
  format: md
---

# Function: createRagPipeline()

```ts
function createRagPipeline(config?): Pipeline;
```

Creates a RAG pipeline from components: plugin objects, or names
registered in the registry. A name that is not registered throws here.

## Parameters

| Parameter | Type                                                      |
| --------- | --------------------------------------------------------- |
| `config?` | [`RagPipelineConfig`](../interfaces/RagPipelineConfig.md) |

## Returns

[`Pipeline`](../interfaces/Pipeline.md)
