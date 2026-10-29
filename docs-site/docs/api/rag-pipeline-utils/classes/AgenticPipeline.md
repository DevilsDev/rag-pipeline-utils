---
mdx:
  format: md
---

# Class: AgenticPipeline

DAG-based agentic RAG orchestrator with two-phase execution:
Phase 1 - Plan: decompose query into sub-queries
Phase 2 - Execute: build DAG of retrieve -> merge -> (critique ->) generate

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new AgenticPipeline(options?): AgenticPipeline;
```

#### Parameters

| Parameter                           | Type                                                                                                                                                                                                                                                                                                                  | Description                                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `options?`                          | \{ `critiqueThreshold?`: `number`; `enableCritique?`: `boolean`; `enableIterativeRetrieval?`: `boolean`; `enableLlmPlanning?`: `boolean`; `enablePlanning?`: `boolean`; `iterativeOptions?`: `object`; `maxConcurrency?`: `number`; `maxIterations?`: `number`; `plannerOptions?`: `object`; `timeout?`: `number`; \} | Override default configuration                                                                                        |
| `options.critiqueThreshold?`        | `number`                                                                                                                                                                                                                                                                                                              | Groundedness threshold for approval                                                                                   |
| `options.enableCritique?`           | `boolean`                                                                                                                                                                                                                                                                                                             | Whether to self-critique answers                                                                                      |
| `options.enableIterativeRetrieval?` | `boolean`                                                                                                                                                                                                                                                                                                             | Whether to use iterative retrieval                                                                                    |
| `options.enableLlmPlanning?`        | `boolean`                                                                                                                                                                                                                                                                                                             | Ask the llm for the sub-queries (strictly validated, heuristic fallback); costs one extra llm.generate() call per run |
| `options.enablePlanning?`           | `boolean`                                                                                                                                                                                                                                                                                                             | Whether to decompose queries                                                                                          |
| `options.iterativeOptions?`         | `object`                                                                                                                                                                                                                                                                                                              | Options forwarded to IterativeRetriever                                                                               |
| `options.maxConcurrency?`           | `number`                                                                                                                                                                                                                                                                                                              | Max concurrent DAG node execution                                                                                     |
| `options.maxIterations?`            | `number`                                                                                                                                                                                                                                                                                                              | Max iterations for iterative retrieval                                                                                |
| `options.plannerOptions?`           | `object`                                                                                                                                                                                                                                                                                                              | Options forwarded to QueryPlanner                                                                                     |
| `options.timeout?`                  | `number`                                                                                                                                                                                                                                                                                                              | Global timeout in ms                                                                                                  |

#### Returns

`AgenticPipeline`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                                      | Type                                            |
| ------------------------------------------------------------- | ----------------------------------------------- |
| <a id="property-config"></a> `config`                         | `any`                                           |
| <a id="property-critiquechecker"></a> `critiqueChecker`       | [`SelfCritiqueChecker`](SelfCritiqueChecker.md) |
| <a id="property-iterativeretriever"></a> `iterativeRetriever` | [`IterativeRetriever`](IterativeRetriever.md)   |
| <a id="property-planner"></a> `planner`                       | [`QueryPlanner`](QueryPlanner.md)               |

## Methods

### run()

```ts
run(params): Promise<{
  answer: string;
  critique: object;
  metadata: object;
  query: string;
  results: object[];
  subQueries: object[];
  success: boolean;
}>;
```

Run the full agentic pipeline: plan -> retrieve -> merge -> (critique ->) generate.

#### Parameters

| Parameter                | Type                                                                                                                                                             | Description                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `params`                 | \{ `embedder?`: `object`; `llm`: `object`; `options?`: \{ `signal?`: `AbortSignal`; \}; `query`: `string`; `queryVector?`: `number`[]; `retriever`: `object`; \} | -                                                                                                                                                                                                                                                                                                                                                                                                 |
| `params.embedder?`       | `object`                                                                                                                                                         | Optional embedder; when given, each sub-query is embedded on its own instead of reusing queryVector                                                                                                                                                                                                                                                                                               |
| `params.llm`             | `object`                                                                                                                                                         | LLM instance with .generate() method                                                                                                                                                                                                                                                                                                                                                              |
| `params.options?`        | \{ `signal?`: `AbortSignal`; \}                                                                                                                                  | Extra options passed to llm.generate()                                                                                                                                                                                                                                                                                                                                                            |
| `params.options.signal?` | `AbortSignal`                                                                                                                                                    | Cancels the run. The run has its own AbortController (also aborted after `timeout`); its signal is passed to retriever.retrieve({ ..., signal }), embedder.embedQuery / embed(text, { signal }) and llm.generate(query, docs, { ...options, signal }), and no later stage starts once it aborts. The returned promise then rejects with Error('Execution timeout') or Error('Execution aborted'). |
| `params.query`           | `string`                                                                                                                                                         | The user query                                                                                                                                                                                                                                                                                                                                                                                    |
| `params.queryVector?`    | `number`[]                                                                                                                                                       | Optional pre-computed query vector                                                                                                                                                                                                                                                                                                                                                                |
| `params.retriever`       | `object`                                                                                                                                                         | Retriever instance with .retrieve() method                                                                                                                                                                                                                                                                                                                                                        |

#### Returns

`Promise`\<\{
`answer`: `string`;
`critique`: `object`;
`metadata`: `object`;
`query`: `string`;
`results`: `object`[];
`subQueries`: `object`[];
`success`: `boolean`;
\}\>

#### Throws

If retriever or llm is missing
