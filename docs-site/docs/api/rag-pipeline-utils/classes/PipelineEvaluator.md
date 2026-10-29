---
mdx:
  format: md
---

# Class: PipelineEvaluator

Evaluates RAG pipeline outputs using multiple quality metrics.
Emits an 'evaluated' event after each evaluation with the full result.

## Example

```ts
const evaluator = new PipelineEvaluator({ metrics: ['faithfulness', 'relevance'] });
evaluator.on('evaluated', (result) => console.log(result.scores));
const result = evaluator.evaluate({ query: 'What is RAG?', answer: '...', results: [...] });
```

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new PipelineEvaluator(options?): PipelineEvaluator;
```

Create a new PipelineEvaluator.

#### Parameters

| Parameter               | Type                                                                                                         | Description                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `options?`              | \{ `includeBLEU?`: `boolean`; `includeROUGE?`: `boolean`; `metrics?`: `string`[]; `threshold?`: `number`; \} | Configuration options                                            |
| `options.includeBLEU?`  | `boolean`                                                                                                    | Whether to include BLEU score when reference answer is provided  |
| `options.includeROUGE?` | `boolean`                                                                                                    | Whether to include ROUGE score when reference answer is provided |
| `options.metrics?`      | `string`[]                                                                                                   | List of metrics to compute                                       |
| `options.threshold?`    | `number`                                                                                                     | Similarity threshold for metrics                                 |

#### Returns

`PipelineEvaluator`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                              | Type       |
| ------------------------------------- | ---------- |
| <a id="property-config"></a> `config` | `object`   |
| `config.includeBLEU`                  | `boolean`  |
| `config.includeROUGE`                 | `boolean`  |
| `config.metrics`                      | `string`[] |
| `config.threshold`                    | `number`   |

## Methods

### evaluate()

```ts
evaluate(pipelineResult, options?): object;
```

Evaluate a pipeline result across all configured metrics.

#### Parameters

| Parameter                  | Type                                                                | Description                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pipelineResult`           | \{ `answer`: `string`; `query`: `string`; `results`: `object`[]; \} | The pipeline output to evaluate                                                                                                                                                                                                                                                                                                                                                  |
| `pipelineResult.answer`    | `string`                                                            | The generated answer                                                                                                                                                                                                                                                                                                                                                             |
| `pipelineResult.query`     | `string`                                                            | The original user query                                                                                                                                                                                                                                                                                                                                                          |
| `pipelineResult.results`   | `object`[]                                                          | Retrieved documents                                                                                                                                                                                                                                                                                                                                                              |
| `options?`                 | \{ `citationResult?`: `object`; `referenceAnswer?`: `string`; \}    | Additional evaluation options                                                                                                                                                                                                                                                                                                                                                    |
| `options.citationResult?`  | `object`                                                            | Pre-computed citation result for faithfulness shortcut                                                                                                                                                                                                                                                                                                                           |
| `options.referenceAnswer?` | `string`                                                            | Reference (ground-truth) answer. Required for context recall (how much of it the retrieved documents support) and used for BLEU/ROUGE. Without it, contextRecall is left out of `scores`, `details.contextRecall` is `{ score: null, skipped: true, reason }`, it is listed in `metadata.metricsSkipped`, and groundedness renormalises over faithfulness and context precision. |

#### Returns

`object`

##### details

```ts
details: object;
```

###### Index Signature

```ts
[x: string]: object
```

##### metadata

```ts
metadata: object;
```

###### metadata.metricsComputed

```ts
metricsComputed: string[];
```

###### metadata.metricsSkipped

```ts
metricsSkipped: object[];
```

###### metadata.threshold

```ts
threshold: number;
```

###### metadata.timestamp

```ts
timestamp: string;
```

##### scores

```ts
scores: object;
```

###### Index Signature

```ts
[x: string]: number
```
