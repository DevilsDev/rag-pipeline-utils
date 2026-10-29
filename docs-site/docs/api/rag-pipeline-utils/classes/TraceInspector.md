---
mdx:
  format: md
---

# Class: TraceInspector

Trace inspector that analyzes execution traces produced by ExecutionTracer

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new TraceInspector(options?): TraceInspector;
```

Create a new TraceInspector

#### Parameters

| Parameter  | Type     | Description             |
| ---------- | -------- | ----------------------- |
| `options?` | `object` | Inspector configuration |

#### Returns

`TraceInspector`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                              | Type  |
| ------------------------------------- | ----- |
| <a id="property-config"></a> `config` | `any` |

## Methods

### analyze()

```ts
analyze(trace): object;
```

Analyze a single trace for performance and quality insights

#### Parameters

| Parameter | Type     | Description                       |
| --------- | -------- | --------------------------------- |
| `trace`   | `object` | Trace record from ExecutionTracer |

#### Returns

`object`

Analysis result with summary, breakdown, bottleneck, quality, and recommendations

---

### compare()

```ts
compare(traces): object;
```

Compare multiple traces for consistency and trends

#### Parameters

| Parameter | Type       | Description            |
| --------- | ---------- | ---------------------- |
| `traces`  | `object`[] | Array of trace records |

#### Returns

`object`

Comparison result with averages, ranges, and quality trend

---

### findAnomalies()

```ts
findAnomalies(traces): object[];
```

Find anomalous traces that deviate significantly from the norm

#### Parameters

| Parameter | Type       | Description            |
| --------- | ---------- | ---------------------- |
| `traces`  | `object`[] | Array of trace records |

#### Returns

`object`[]

Array of anomaly descriptors with traceId, anomalyType, details
