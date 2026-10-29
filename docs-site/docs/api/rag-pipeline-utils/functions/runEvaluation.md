---
mdx:
  format: md
---

# Function: runEvaluation()

```ts
function runEvaluation(
  dataset,
  pipeline,
  options?,
): Promise<{
  cases: object[];
  createdAt: string;
  libraryVersion: string;
  summary: {
    cases: number;
    failed: number;
    metrics: {
      [x: string]: object;
    };
    succeeded: number;
  };
  version: number;
}>;
```

Runs every case of a dataset through a pipeline and scores it.

Each case runs with citations and evaluation on, and its expected answer
as the reference. A case that fails is recorded with its error, not
thrown. Throws a DatasetError (`code: 'RAG_INVALID_DATASET'`, `errors`
from validateDataset) when the dataset is invalid.

## Parameters

| Parameter              | Type                                                                                                                                                | Description                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `dataset`              | \| `any`[] \| \{ `cases`: `any`[]; \}                                                                                                               | See validateDataset                        |
| `pipeline`             | \{ `run`: `Function`; \}                                                                                                                            | A createRagPipeline() pipeline             |
| `pipeline.run`         | `Function`                                                                                                                                          | -                                          |
| `options?`             | \{ `concurrency?`: `number`; `onCase?`: (`caseResult`, `index`) => `void`; `runOptions?`: `any`; `signal?`: `AbortSignal`; `timeout?`: `number`; \} | -                                          |
| `options.concurrency?` | `number`                                                                                                                                            | Cases run at the same time                 |
| `options.onCase?`      | (`caseResult`, `index`) => `void`                                                                                                                   | Called as each case finishes               |
| `options.runOptions?`  | `any`                                                                                                                                               | Extra `run()` options for every case       |
| `options.signal?`      | `AbortSignal`                                                                                                                                       | Stops the run; unstarted cases are not run |
| `options.timeout?`     | `number`                                                                                                                                            | Per-case timeout in milliseconds           |

## Returns

`Promise`\<\{
`cases`: `object`[];
`createdAt`: `string`;
`libraryVersion`: `string`;
`summary`: \{
`cases`: `number`;
`failed`: `number`;
`metrics`: \{
\[`x`: `string`\]: `object`;
\};
`succeeded`: `number`;
\};
`version`: `number`;
\}\>

A JSON-serialisable report
