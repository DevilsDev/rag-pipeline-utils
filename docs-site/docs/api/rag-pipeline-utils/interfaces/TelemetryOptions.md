---
mdx:
  format: md
---

# Interface: TelemetryOptions

The `telemetry` option of createRagPipeline.

## Properties

| Property                                             | Type                                    | Description                                                                                                                                                                             |
| ---------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="property-api"></a> `api?`                     | `any`                                   | The @opentelemetry/api module, for @devilsdev/rag-pipeline-utils/edge, which cannot load it itself.                                                                                     |
| <a id="property-logger"></a> `logger?`               | `object`                                | A Logger (`emit(logRecord)`) for the gen_ai.evaluation.result events.                                                                                                                   |
| `logger.emit`                                        | (`logRecord`) => `void`                 | -                                                                                                                                                                                       |
| <a id="property-logs"></a> `logs?`                   | `any`                                   | The @opentelemetry/api-logs module, for evaluation events when your SDK registers its LoggerProvider there (before sdk-logs 3). With @opentelemetry/api 1.10+ its own logs API is used. |
| <a id="property-recordcontent"></a> `recordContent?` | `boolean`                               | Also record the query text and the retrieved document ids and scores. Default false.                                                                                                    |
| <a id="property-tracer"></a> `tracer?`               | [`TelemetryTracer`](TelemetryTracer.md) | Default: `trace.getTracer("@devilsdev/rag-pipeline-utils", version)`.                                                                                                                   |
