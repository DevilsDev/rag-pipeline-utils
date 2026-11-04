---
mdx:
  format: md
---

# Function: toLangfuseScores()

```ts
function toLangfuseScores(result, options?): object[];
```

The scores of a run result or answer check as Langfuse scores: the
objects `langfuse.score.create()` takes (from `@langfuse/client`), and,
without a trace id, the evaluations a Langfuse experiment evaluator
returns. Langfuse is not a dependency.

With `telemetry` on, a run result carries its OpenTelemetry trace and span
ids in `result.telemetry`; Langfuse uses the same ids when it receives the
spans (LangfuseSpanProcessor), so each score is attached to the trace and
to the span it judges: the retrieval for contextPrecision and
contextRecall, the generation for the rest. A score whose stage had no
span (a cache hit) gets the trace only: Langfuse's default span filter
keeps the stage spans (they have gen_ai.\* attributes) but not the run
span, so an observation id for it could point at nothing.

## Parameters

| Parameter                | Type                                                                                                    | Description                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `result`                 | `object`                                                                                                | A pipeline run result, a stream's done chunk, or a checkAnswer() result |
| `options?`               | \{ `comments?`: `boolean`; `observationId?`: `string`; `sessionId?`: `string`; `traceId?`: `string`; \} | -                                                                       |
| `options.comments?`      | `boolean`                                                                                               | Add explanations as comments; they quote the answer                     |
| `options.observationId?` | `string`                                                                                                | Attach every score to this observation                                  |
| `options.sessionId?`     | `string`                                                                                                | -                                                                       |
| `options.traceId?`       | `string`                                                                                                | Overrides `result.telemetry.traceId`                                    |

## Returns

`object`[]
