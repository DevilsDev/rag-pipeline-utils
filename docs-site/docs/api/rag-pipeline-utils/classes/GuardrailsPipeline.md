---
mdx:
  format: md
---

# Class: GuardrailsPipeline

Pipeline wrapper that applies all three guardrail layers (pre-retrieval,
retrieval, and post-generation) around an existing RAG pipeline. In strict
mode, any guard failure aborts the pipeline; otherwise issues are collected
as warnings and execution continues.

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new GuardrailsPipeline(pipeline, options?): GuardrailsPipeline;
```

#### Parameters

| Parameter                 | Type                                                                                                                                         | Description                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `pipeline`                | `object`                                                                                                                                     | The underlying RAG pipeline (must have a .run() method) |
| `options?`                | \{ `postGeneration?`: `false` \| `object`; `preRetrieval?`: `false` \| `object`; `retrieval?`: `false` \| `object`; `strict?`: `boolean`; \} | Override default configuration                          |
| `options.postGeneration?` | `false` \| `object`                                                                                                                          | PostGenerationGuard options, or false to disable        |
| `options.preRetrieval?`   | `false` \| `object`                                                                                                                          | PreRetrievalGuard options, or false to disable          |
| `options.retrieval?`      | `false` \| `object`                                                                                                                          | RetrievalGuard options, or false to disable             |
| `options.strict?`         | `boolean`                                                                                                                                    | Whether to block on any guard failure                   |

#### Returns

`GuardrailsPipeline`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                              | Type                                            |
| ----------------------------------------------------- | ----------------------------------------------- |
| <a id="property-config"></a> `config`                 | `any`                                           |
| <a id="property-pipeline"></a> `pipeline`             | `any`                                           |
| <a id="property-postguard"></a> `postGuard`           | [`PostGenerationGuard`](PostGenerationGuard.md) |
| <a id="property-preguard"></a> `preGuard`             | [`PreRetrievalGuard`](PreRetrievalGuard.md)     |
| <a id="property-retrievalguard"></a> `retrievalGuard` | [`RetrievalGuard`](RetrievalGuard.md)           |

## Methods

### run()

```ts
run(input): Promise<object>;
```

Run the full guarded pipeline.

#### Parameters

| Parameter            | Type                                                                                                 | Description                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `input`              | \{ `context?`: `object`; `options?`: `object`; `query`: `string`; `queryVector?`: `Float32Array`; \} | Pipeline input                                 |
| `input.context?`     | `object`                                                                                             | Request context (e.g. userPermissions for ACL) |
| `input.options?`     | `object`                                                                                             | Additional pipeline options                    |
| `input.query`        | `string`                                                                                             | The user query                                 |
| `input.queryVector?` | `Float32Array`                                                                                       | Optional precomputed query vector              |

#### Returns

`Promise`\<`object`\>

Pipeline result with guardrails metadata attached
