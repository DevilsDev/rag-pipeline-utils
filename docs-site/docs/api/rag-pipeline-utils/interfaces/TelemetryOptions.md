---
mdx:
  format: md
---

# Interface: TelemetryOptions

The `telemetry` option of createRagPipeline.

## Properties

| Property                                             | Type                                    | Description                                                                                                      |
| ---------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| <a id="property-api"></a> `api?`                     | `any`                                   | The @opentelemetry/api module, for @devilsdev/rag-pipeline-utils/edge, which cannot load it itself (from 3.2.0). |
| <a id="property-recordcontent"></a> `recordContent?` | `boolean`                               | Also record the query text and the retrieved document ids and scores. Default false.                             |
| <a id="property-tracer"></a> `tracer?`               | [`TelemetryTracer`](TelemetryTracer.md) | Default: `trace.getTracer("@devilsdev/rag-pipeline-utils", version)`.                                            |
