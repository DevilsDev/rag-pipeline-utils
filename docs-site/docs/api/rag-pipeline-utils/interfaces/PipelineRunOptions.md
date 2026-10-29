---
mdx:
  format: md
---

# Interface: PipelineRunOptions

The argument of [Pipeline.run](Pipeline.md#run). Give a `query`, a `queryVector`, or both.

## Properties

| Property                                         | Type                                                                                                   | Description                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| <a id="property-options"></a> `options?`         | `object`                                                                                               | Per-run options. The whole object is also passed to `llm.generate`.                                       |
| `options.citationOptions?`                       | `Record`\<`string`, `any`\>                                                                            | -                                                                                                         |
| `options.citations?`                             | `boolean`                                                                                              | Attribute the answer's sentences to the retrieved documents (see CitationTracker).                        |
| `options.evaluate?`                              | `boolean`                                                                                              | Score the run (see PipelineEvaluator).                                                                    |
| `options.evaluateOptions?`                       | `Record`\<`string`, `any`\>                                                                            | -                                                                                                         |
| `options.filterResults?`                         | (`docs`) => \| [`SearchResult`](SearchResult.md)[] \| `Promise`\<[`SearchResult`](SearchResult.md)[]\> | Filter or transform the retrieved documents before reranking.                                             |
| `options.referenceAnswer?`                       | `string`                                                                                               | Ground-truth answer, used by evaluation for context recall.                                               |
| `options.signal?`                                | `AbortSignal`                                                                                          | Cancel the run; it resolves `{ success: false, error: "Execution aborted" }`.                             |
| `options.stream?`                                | `boolean`                                                                                              | Resolve to an async iterable of [StreamChunk](StreamChunk.md) instead of a result.                        |
| `options.timeout?`                               | `number`                                                                                               | Abort the run after this many milliseconds; it resolves `{ success: false, error: "Execution timeout" }`. |
| `options.topK?`                                  | `number`                                                                                               | Documents to retrieve. Default 3.                                                                         |
| <a id="property-query"></a> `query?`             | `string`                                                                                               | The question. Embedded by the embedder unless `queryVector` is given.                                     |
| <a id="property-queryvector"></a> `queryVector?` | `number`[]                                                                                             | A precomputed query embedding; skips the embedder.                                                        |
