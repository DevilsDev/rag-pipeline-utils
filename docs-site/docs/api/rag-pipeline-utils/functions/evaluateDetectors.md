---
mdx:
  format: md
---

# Function: evaluateDetectors()

```ts
function evaluateDetectors(cases, detectors, options?): Promise<object>;
```

Run detectors over labelled cases and score them.

## Parameters

| Parameter                | Type                                                                                                                               | Description                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `cases`                  | `object`[]                                                                                                                         | Labelled cases (see the module comment)                                                                              |
| `detectors`              | `object`[]                                                                                                                         | -                                                                                                                    |
| `options?`               | \{ `concurrency?`: `number`; `coveredLabels?`: \| `string`[] \| \{ \[`x`: `string`\]: `string`[]; \}; `signal?`: `AbortSignal`; \} | -                                                                                                                    |
| `options.concurrency?`   | `number`                                                                                                                           | Cases in flight per detector                                                                                         |
| `options.coveredLabels?` | \| `string`[] \| \{ \[`x`: `string`\]: `string`[]; \}                                                                              | Span labels each PII detector is meant to find, for the headline span recall; an array applies to every PII detector |
| `options.signal?`        | `AbortSignal`                                                                                                                      | Stops the run                                                                                                        |

## Returns

`Promise`\<`object`\>

The report: `{ createdAt, cases, detectors: { [name]: metrics } }`
