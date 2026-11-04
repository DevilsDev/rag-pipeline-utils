---
mdx:
  format: md
---

# Interface: RunTelemetry

A run's OpenTelemetry ids, on its result when `telemetry` is on.

## Properties

| Property                                | Type     | Description                                                      |
| --------------------------------------- | -------- | ---------------------------------------------------------------- |
| <a id="property-spanid"></a> `spanId`   | `string` | The `rag.pipeline.run` span.                                     |
| <a id="property-spans"></a> `spans`     | `object` | The stage spans, when the stage ran (not served from the cache). |
| `spans.generation?`                     | `string` | -                                                                |
| `spans.retrieval?`                      | `string` | -                                                                |
| <a id="property-traceid"></a> `traceId` | `string` | -                                                                |
