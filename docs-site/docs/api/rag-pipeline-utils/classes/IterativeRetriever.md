---
mdx:
  format: md
---

# Class: IterativeRetriever

Iterative retriever that loops: retrieve -> check coverage -> refine -> re-retrieve.
Continues until coverage threshold is met or maxIterations is reached.

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new IterativeRetriever(options?): IterativeRetriever;
```

#### Parameters

| Parameter                    | Type                                                                                         | Description                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `options?`                   | \{ `coverageThreshold?`: `number`; `maxIterations?`: `number`; `retryOptions?`: `object`; \} | Override default configuration                   |
| `options.coverageThreshold?` | `number`                                                                                     | Jaccard similarity threshold for convergence     |
| `options.maxIterations?`     | `number`                                                                                     | Maximum retrieval iterations                     |
| `options.retryOptions?`      | `object`                                                                                     | Options passed to retry() on each retrieval call |

#### Returns

`IterativeRetriever`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                              | Type  |
| ------------------------------------- | ----- |
| <a id="property-config"></a> `config` | `any` |

## Methods

### retrieve()

```ts
retrieve(params): Promise<{
  converged: boolean;
  coverage: number;
  iterations: number;
  results: object[];
}>;
```

Perform iterative retrieval with coverage checking and query refinement.

#### Parameters

| Parameter             | Type                                                                                                                                           | Description                                                                                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `params`              | \{ `embedder?`: `object`; `llm?`: `object`; `query`: `string`; `queryVector?`: `number`[]; `retriever`: `object`; `signal?`: `AbortSignal`; \} | -                                                                                                                                                                                                                                    |
| `params.embedder?`    | `object`                                                                                                                                       | Optional embedder; when given, each refined query is re-embedded instead of reusing queryVector                                                                                                                                      |
| `params.llm?`         | `object`                                                                                                                                       | Optional LLM for query refinement                                                                                                                                                                                                    |
| `params.query`        | `string`                                                                                                                                       | The search query                                                                                                                                                                                                                     |
| `params.queryVector?` | `number`[]                                                                                                                                     | Optional pre-computed query vector                                                                                                                                                                                                   |
| `params.retriever`    | `object`                                                                                                                                       | Retriever instance with .retrieve() method                                                                                                                                                                                           |
| `params.signal?`      | `AbortSignal`                                                                                                                                  | Cancels the loop: passed to retriever.retrieve({ ..., signal }), the embedder and llm.generate(..., { signal }); no further iteration, retry or refinement starts once it has aborted, and the call rejects with the signal's reason |

#### Returns

`Promise`\<\{
`converged`: `boolean`;
`coverage`: `number`;
`iterations`: `number`;
`results`: `object`[];
\}\>

#### Throws

If query or retriever is missing
