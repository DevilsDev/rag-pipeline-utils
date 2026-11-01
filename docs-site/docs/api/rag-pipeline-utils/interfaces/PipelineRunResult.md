---
mdx:
  format: md
---

# Interface: PipelineRunResult

What [Pipeline.run](Pipeline.md#run) resolves to without streaming. A failed, timed-out
or aborted run resolves `{ success: false, error }`; `run` never rejects.

## Properties

| Property                                       | Type                                              | Description                                                                                         |
| ---------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| <a id="property-answer"></a> `answer?`         | `string`                                          | The LLM's answer; null when the pipeline has no llm.                                                |
| <a id="property-cache"></a> `cache?`           | `object`                                          | Per-layer cache outcome; present when the pipeline has a cache.                                     |
| `cache.embeddings?`                            | [`CacheOutcome`](../type-aliases/CacheOutcome.md) | -                                                                                                   |
| `cache.generation?`                            | [`CacheOutcome`](../type-aliases/CacheOutcome.md) | -                                                                                                   |
| `cache.retrieval?`                             | [`CacheOutcome`](../type-aliases/CacheOutcome.md) | -                                                                                                   |
| <a id="property-citations"></a> `citations?`   | `any`                                             | Present when `options.citations` was set and there is an answer.                                    |
| <a id="property-error"></a> `error?`           | `string`                                          | The error message when `success` is false.                                                          |
| <a id="property-evaluation"></a> `evaluation?` | `any`                                             | Present when `options.evaluate` was set.                                                            |
| <a id="property-packing"></a> `packing?`       | [`ContextPacking`](ContextPacking.md)             | What `maxContextTokens` kept and cut; present when it was set.                                      |
| <a id="property-query"></a> `query?`           | `string`                                          | -                                                                                                   |
| <a id="property-results"></a> `results?`       | [`SearchResult`](SearchResult.md)[]               | The retrieved (filtered, reranked) documents; with `maxContextTokens`, the packed ones the LLM saw. |
| <a id="property-route"></a> `route?`           | [`RouteDecision`](RouteDecision.md)               | The model router's decision, when the llm is a createModelRouter() and was called.                  |
| <a id="property-success"></a> `success`        | `boolean`                                         | -                                                                                                   |
| <a id="property-timing"></a> `timing?`         | `object`                                          | How long the run took, from the start of run(); on successful results.                              |
| `timing.totalMs`                               | `number`                                          | -                                                                                                   |
