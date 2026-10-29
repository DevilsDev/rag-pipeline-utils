---
mdx:
  format: md
---

# Function: evaluationVerdict()

```ts
function evaluationVerdict(input?): object;
```

Decides whether a run passes: no case failed, every metric in `min` is at
or above its minimum, and the comparison (if any) found no regression.

## Parameters

| Parameter           | Type                                                                                     | Description                                           |
| ------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `input?`            | \{ `comparison?`: `any`; `min?`: \{ \[`x`: `string`\]: `number`; \}; `report`: `any`; \} | -                                                     |
| `input.comparison?` | `any`                                                                                    | A compareConfigurations() result                      |
| `input.min?`        | \{ \[`x`: `string`\]: `number`; \}                                                       | Minimum mean per metric, e.g. `{ faithfulness: 0.8 }` |
| `input.report`      | `any`                                                                                    | A runEvaluation() report                              |

## Returns

`object`

### passed

```ts
passed: boolean;
```

### reasons

```ts
reasons: string[];
```

### thresholds

```ts
thresholds: object[];
```
