---
mdx:
  format: md
---

# Interface: TelemetryTracer

A tracer that can start active spans, such as an OpenTelemetry `Tracer`.
Declared here so the types don't depend on the optional peer dependency.

## Methods

### startActiveSpan()

```ts
startActiveSpan(...args): any;
```

#### Parameters

| Parameter | Type    |
| --------- | ------- |
| ...`args` | `any`[] |

#### Returns

`any`
