---
mdx:
  format: md
---

# Function: createTestPipeline()

```ts
function createTestPipeline(options?): Promise<{
  embedder: any;
  llm: any;
  pipeline: any;
  retriever: MemoryRetriever;
}>;
```

A pipeline with HashEmbedder, a MemoryRetriever already holding
`documents`, and EchoLLM (or the llm you pass).

## Parameters

| Parameter            | Type                                                                                   | Description                                        |
| -------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `options?`           | \{ `documents?`: `object`[]; `embedder?`: `any`; `llm?`: `any`; `pipeline?`: `any`; \} | -                                                  |
| `options.documents?` | `object`[]                                                                             | -                                                  |
| `options.embedder?`  | `any`                                                                                  | Defaults to a new HashEmbedder                     |
| `options.llm?`       | `any`                                                                                  | Defaults to a new EchoLLM; null for retrieval only |
| `options.pipeline?`  | `any`                                                                                  | Extra createRagPipeline options (e.g. reranker)    |

## Returns

`Promise`\<\{
`embedder`: `any`;
`llm`: `any`;
`pipeline`: `any`;
`retriever`: [`MemoryRetriever`](../../rag-pipeline-utils/classes/MemoryRetriever.md);
\}\>

## Example

```ts
const { createTestPipeline } = require("@devilsdev/rag-pipeline-utils/testing");
const { pipeline, llm } = await createTestPipeline();
const result = await pipeline.run({ query: "How many vacation days?" });
// result.results[0].id === 'vacation'; llm.calls.length === 1
```
