---
mdx:
  format: md
---

# Class: ExecutionTracer

Execution tracer that wraps pipelines to capture run traces

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new ExecutionTracer(options?): ExecutionTracer;
```

Create a new ExecutionTracer

#### Parameters

| Parameter                 | Type                                                                                          | Description                              |
| ------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `options?`                | \{ `captureInputs?`: `boolean`; `captureOutputs?`: `boolean`; `maxPayloadSize?`: `number`; \} | Tracer configuration                     |
| `options.captureInputs?`  | `boolean`                                                                                     | Whether to capture step inputs           |
| `options.captureOutputs?` | `boolean`                                                                                     | Whether to capture step outputs          |
| `options.maxPayloadSize?` | `number`                                                                                      | Max characters before payload truncation |

#### Returns

`ExecutionTracer`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                              | Type      |
| ------------------------------------- | --------- |
| <a id="property-config"></a> `config` | `object`  |
| `config.captureInputs`                | `boolean` |
| `config.captureOutputs`               | `boolean` |
| `config.maxPayloadSize`               | `number`  |
| <a id="property-traces"></a> `traces` | `any`[]   |

## Methods

### clear()

```ts
clear(): void;
```

Clear all recorded traces

#### Returns

`void`

---

### exportTraces()

```ts
exportTraces(format?): string;
```

Export traces as a serialized string

#### Parameters

| Parameter | Type     | Description                           |
| --------- | -------- | ------------------------------------- |
| `format?` | `string` | Export format (currently only 'json') |

#### Returns

`string`

Serialized traces

---

### getTrace()

```ts
getTrace(traceId): object;
```

Return a specific trace by ID

#### Parameters

| Parameter | Type     | Description             |
| --------- | -------- | ----------------------- |
| `traceId` | `string` | The trace ID to look up |

#### Returns

`object`

The trace record, or undefined if not found

---

### getTraces()

```ts
getTraces(): object[];
```

Return all recorded traces

#### Returns

`object`[]

Array of trace records

---

### trace()

```ts
trace(pipeline): object;
```

Wrap a pipeline to record execution traces on each run

#### Parameters

| Parameter  | Type     | Description                            |
| ---------- | -------- | -------------------------------------- |
| `pipeline` | `object` | Pipeline instance with a .run() method |

#### Returns

`object`

Wrapped pipeline with instrumented .run()
