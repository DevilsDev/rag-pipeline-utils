---
mdx:
  format: md
---

# Function: compareConfigurations()

```ts
function compareConfigurations(
  dataset,
  options?,
): Promise<{
  baseline: any;
  candidate: any;
  improvements: object[];
  metrics: {
    [x: string]: object;
  };
  regressed: boolean;
  regressions: object[];
  warnings: string[];
}>;
```

Compares two configurations on the same dataset and reports what got
worse. Each side is a pipeline (run now) or a saved runEvaluation()
report, so CI can compare against the base branch's saved report.

A metric has regressed when its mean drops by more than `tolerance`.
A case has regressed when it now fails, or a metric drops by more than
`caseTolerance`; those cases are listed but don't set `regressed` on
their own, except failures. Scores from LLM answers vary between runs,
so keep the tolerances above the noise you see on repeated runs.

## Parameters

| Parameter                | Type                                                                                                                                           | Description                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `dataset`                | \| `any`[] \| \{ `cases`: `any`[]; \}                                                                                                          | Needed when either side is a pipeline               |
| `options?`               | \{ `baseline`: `any`; `candidate`: `any`; `caseTolerance?`: `number`; `metrics?`: `string`[]; `runOptions?`: `any`; `tolerance?`: `number`; \} | -                                                   |
| `options.baseline`       | `any`                                                                                                                                          | Pipeline or report                                  |
| `options.candidate`      | `any`                                                                                                                                          | Pipeline or report                                  |
| `options.caseTolerance?` | `number`                                                                                                                                       | Drop in one case's metric that lists the case       |
| `options.metrics?`       | `string`[]                                                                                                                                     | Metrics to compare (default: all both runs have)    |
| `options.runOptions?`    | `any`                                                                                                                                          | Options for runEvaluation when a side is a pipeline |
| `options.tolerance?`     | `number`                                                                                                                                       | Allowed drop in a metric's mean                     |

## Returns

`Promise`\<\{
`baseline`: `any`;
`candidate`: `any`;
`improvements`: `object`[];
`metrics`: \{
\[`x`: `string`\]: `object`;
\};
`regressed`: `boolean`;
`regressions`: `object`[];
`warnings`: `string`[];
\}\>
