---
mdx:
  format: md
---

# Class: PipelineMetrics

In-memory totals for pipeline operations: embedding, retrieval and LLM
calls, errors, operation counts, concurrency, backpressure and heap usage.

## Constructors

### Constructor

```ts
new PipelineMetrics(): PipelineMetrics;
```

#### Returns

`PipelineMetrics`

## Properties

| Property                                                          | Type                    |
| ----------------------------------------------------------------- | ----------------------- |
| <a id="property-backpressureapplied"></a> `backpressureApplied`   | `number`                |
| <a id="property-backpressurereleased"></a> `backpressureReleased` | `number`                |
| <a id="property-backpressuresamples"></a> `backpressureSamples`   | `any`[]                 |
| <a id="property-concurrency"></a> `concurrency`                   | `object`                |
| `concurrency.concurrencyValues`                                   | `any`[]                 |
| `concurrency.maxConcurrency`                                      | `number`                |
| <a id="property-counters"></a> `counters`                         | `object`                |
| `counters.operationsActive`                                       | [`Gauge`](Gauge.md)     |
| `counters.operationsFailed`                                       | [`Counter`](Counter.md) |
| `counters.operationsSuccessful`                                   | [`Counter`](Counter.md) |
| `counters.operationsTotal`                                        | [`Counter`](Counter.md) |
| <a id="property-embedding"></a> `embedding`                       | `object`                |
| `embedding.durations`                                             | `any`[]                 |
| `embedding.operations`                                            | `number`                |
| `embedding.totalBatches`                                          | `number`                |
| `embedding.totalDuration`                                         | `number`                |
| `embedding.totalTokens`                                           | `number`                |
| <a id="property-errorsbyplugin"></a> `errorsByPlugin`             | `object`                |
| <a id="property-errorsbytype"></a> `errorsByType`                 | `object`                |
| `errorsByType.plugin`                                             | `number`                |
| `errorsByType.stage`                                              | `number`                |
| <a id="property-llm"></a> `llm`                                   | `object`                |
| `llm.durations`                                                   | `any`[]                 |
| `llm.inputTokens`                                                 | `any`[]                 |
| `llm.operations`                                                  | `number`                |
| `llm.outputTokens`                                                | `any`[]                 |
| `llm.streamingOps`                                                | `number`                |
| `llm.totalDuration`                                               | `number`                |
| `llm.totalInputTokens`                                            | `number`                |
| `llm.totalOutputTokens`                                           | `number`                |
| <a id="property-memory"></a> `memory`                             | `object`                |
| `memory.heapTotal`                                                | `number`                |
| `memory.heapUsed`                                                 | `number`                |
| `memory.usagePercentage`                                          | `number`                |
| <a id="property-retrieval"></a> `retrieval`                       | `object`                |
| `retrieval.durations`                                             | `any`[]                 |
| `retrieval.operations`                                            | `number`                |
| `retrieval.totalDuration`                                         | `number`                |
| `retrieval.totalResults`                                          | `number`                |

## Methods

### clearMetrics()

```ts
clearMetrics(): void;
```

Reset every counter, total and sample to its initial value.

#### Returns

`void`

---

### exportMetrics()

```ts
exportMetrics(): object;
```

getSummary() plus the raw recorded values, with a timestamp.

#### Returns

`object`

Object with timestamp, summary and rawMetrics

##### rawMetrics

```ts
rawMetrics: object;
```

###### rawMetrics.backpressure

```ts
backpressure: object;
```

###### rawMetrics.backpressure.applied

```ts
applied: number;
```

###### rawMetrics.backpressure.released

```ts
released: number;
```

###### rawMetrics.backpressure.samples

```ts
samples: any[];
```

###### rawMetrics.concurrency

```ts
concurrency: object;
```

###### rawMetrics.concurrency.concurrencyValues

```ts
concurrencyValues: any[];
```

###### rawMetrics.concurrency.maxConcurrency

```ts
maxConcurrency: number;
```

###### rawMetrics.counters

```ts
counters: object;
```

###### rawMetrics.counters.operationsActive

```ts
operationsActive: Gauge;
```

###### rawMetrics.counters.operationsFailed

```ts
operationsFailed: Counter;
```

###### rawMetrics.counters.operationsSuccessful

```ts
operationsSuccessful: Counter;
```

###### rawMetrics.counters.operationsTotal

```ts
operationsTotal: Counter;
```

###### rawMetrics.embedding

```ts
embedding: object;
```

###### rawMetrics.embedding.durations

```ts
durations: any[];
```

###### rawMetrics.embedding.operations

```ts
operations: number;
```

###### rawMetrics.embedding.totalBatches

```ts
totalBatches: number;
```

###### rawMetrics.embedding.totalDuration

```ts
totalDuration: number;
```

###### rawMetrics.embedding.totalTokens

```ts
totalTokens: number;
```

###### rawMetrics.errors

```ts
errors: object;
```

###### rawMetrics.errors.byPlugin

```ts
byPlugin: object;
```

###### rawMetrics.errors.byType

```ts
byType: object;
```

###### rawMetrics.errors.byType.plugin

```ts
plugin: number;
```

###### rawMetrics.errors.byType.stage

```ts
stage: number;
```

###### rawMetrics.llm

```ts
llm: object;
```

###### rawMetrics.llm.durations

```ts
durations: any[];
```

###### rawMetrics.llm.inputTokens

```ts
inputTokens: any[];
```

###### rawMetrics.llm.operations

```ts
operations: number;
```

###### rawMetrics.llm.outputTokens

```ts
outputTokens: any[];
```

###### rawMetrics.llm.streamingOps

```ts
streamingOps: number;
```

###### rawMetrics.llm.totalDuration

```ts
totalDuration: number;
```

###### rawMetrics.llm.totalInputTokens

```ts
totalInputTokens: number;
```

###### rawMetrics.llm.totalOutputTokens

```ts
totalOutputTokens: number;
```

###### rawMetrics.memory

```ts
memory: object;
```

###### rawMetrics.memory.heapTotal

```ts
heapTotal: number;
```

###### rawMetrics.memory.heapUsed

```ts
heapUsed: number;
```

###### rawMetrics.memory.usagePercentage

```ts
usagePercentage: number;
```

###### rawMetrics.retrieval

```ts
retrieval: object;
```

###### rawMetrics.retrieval.durations

```ts
durations: any[];
```

###### rawMetrics.retrieval.operations

```ts
operations: number;
```

###### rawMetrics.retrieval.totalDuration

```ts
totalDuration: number;
```

###### rawMetrics.retrieval.totalResults

```ts
totalResults: number;
```

##### summary

```ts
summary: object;
```

###### summary.backpressure

```ts
backpressure: object;
```

###### summary.backpressure.appliedEvents

```ts
appliedEvents: number;
```

###### summary.backpressure.avgBufferSize

```ts
avgBufferSize: object;
```

###### summary.backpressure.avgBufferSize.mean

```ts
mean: number;
```

###### summary.backpressure.releasedEvents

```ts
releasedEvents: number;
```

###### summary.backpressure.totalEvents

```ts
totalEvents: number;
```

###### summary.concurrency

```ts
concurrency: object;
```

###### summary.concurrency.avgConcurrency

```ts
avgConcurrency: object;
```

###### summary.concurrency.avgConcurrency.mean

```ts
mean: number;
```

###### summary.concurrency.maxConcurrency

```ts
maxConcurrency: number;
```

###### summary.embedding

```ts
embedding: object;
```

###### summary.embedding.avgDuration

```ts
avgDuration: object;
```

###### summary.embedding.avgDuration.mean

```ts
mean: number;
```

###### summary.embedding.totalBatches

```ts
totalBatches: number;
```

###### summary.embedding.totalDuration

```ts
totalDuration: number;
```

###### summary.embedding.totalOperations

```ts
totalOperations: number;
```

###### summary.embedding.totalTokens

```ts
totalTokens: number;
```

###### summary.errors

```ts
errors: object;
```

###### summary.errors.byPlugin

```ts
byPlugin: object;
```

###### summary.errors.byType

```ts
byType: object;
```

###### summary.errors.byType.plugin

```ts
plugin: number;
```

###### summary.errors.byType.stage

```ts
stage: number;
```

###### summary.errors.total

```ts
total: number;
```

###### summary.llm

```ts
llm: object;
```

###### summary.llm.avgDuration

```ts
avgDuration: object;
```

###### summary.llm.avgDuration.mean

```ts
mean: number;
```

###### summary.llm.avgInputTokens

```ts
avgInputTokens: object;
```

###### summary.llm.avgInputTokens.mean

```ts
mean: number;
```

###### summary.llm.avgOutputTokens

```ts
avgOutputTokens: object;
```

###### summary.llm.avgOutputTokens.mean

```ts
mean: number;
```

###### summary.llm.streamingOperations

```ts
streamingOperations: number;
```

###### summary.llm.totalOperations

```ts
totalOperations: number;
```

###### summary.memory

```ts
memory: object;
```

###### summary.memory.heapTotal

```ts
heapTotal: number;
```

###### summary.memory.heapUsed

```ts
heapUsed: number;
```

###### summary.memory.usagePercentage

```ts
usagePercentage: number;
```

###### summary.operations

```ts
operations: object;
```

###### summary.operations.failed

```ts
failed: number;
```

###### summary.operations.successful

```ts
successful: number;
```

###### summary.operations.total

```ts
total: number;
```

###### summary.retrieval

```ts
retrieval: object;
```

###### summary.retrieval.avgDuration

```ts
avgDuration: object;
```

###### summary.retrieval.avgDuration.mean

```ts
mean: number;
```

###### summary.retrieval.totalOperations

```ts
totalOperations: number;
```

###### summary.retrieval.totalResults

```ts
totalResults: number;
```

##### timestamp

```ts
timestamp: string;
```

---

### getSummary()

```ts
getSummary(): object;
```

Totals and averages for every recorded category. Averages are 0 when
nothing was recorded.

#### Returns

`object`

Summary grouped by embedding, retrieval, llm, memory, errors, operations, concurrency and backpressure

##### backpressure

```ts
backpressure: object;
```

###### backpressure.appliedEvents

```ts
appliedEvents: number;
```

###### backpressure.avgBufferSize

```ts
avgBufferSize: object;
```

###### backpressure.avgBufferSize.mean

```ts
mean: number;
```

###### backpressure.releasedEvents

```ts
releasedEvents: number;
```

###### backpressure.totalEvents

```ts
totalEvents: number;
```

##### concurrency

```ts
concurrency: object;
```

###### concurrency.avgConcurrency

```ts
avgConcurrency: object;
```

###### concurrency.avgConcurrency.mean

```ts
mean: number;
```

###### concurrency.maxConcurrency

```ts
maxConcurrency: number;
```

##### embedding

```ts
embedding: object;
```

###### embedding.avgDuration

```ts
avgDuration: object;
```

###### embedding.avgDuration.mean

```ts
mean: number;
```

###### embedding.totalBatches

```ts
totalBatches: number;
```

###### embedding.totalDuration

```ts
totalDuration: number;
```

###### embedding.totalOperations

```ts
totalOperations: number;
```

###### embedding.totalTokens

```ts
totalTokens: number;
```

##### errors

```ts
errors: object;
```

###### errors.byPlugin

```ts
byPlugin: object;
```

###### errors.byType

```ts
byType: object;
```

###### errors.byType.plugin

```ts
plugin: number;
```

###### errors.byType.stage

```ts
stage: number;
```

###### errors.total

```ts
total: number;
```

##### llm

```ts
llm: object;
```

###### llm.avgDuration

```ts
avgDuration: object;
```

###### llm.avgDuration.mean

```ts
mean: number;
```

###### llm.avgInputTokens

```ts
avgInputTokens: object;
```

###### llm.avgInputTokens.mean

```ts
mean: number;
```

###### llm.avgOutputTokens

```ts
avgOutputTokens: object;
```

###### llm.avgOutputTokens.mean

```ts
mean: number;
```

###### llm.streamingOperations

```ts
streamingOperations: number;
```

###### llm.totalOperations

```ts
totalOperations: number;
```

##### memory

```ts
memory: object;
```

###### memory.heapTotal

```ts
heapTotal: number;
```

###### memory.heapUsed

```ts
heapUsed: number;
```

###### memory.usagePercentage

```ts
usagePercentage: number;
```

##### operations

```ts
operations: object;
```

###### operations.failed

```ts
failed: number;
```

###### operations.successful

```ts
successful: number;
```

###### operations.total

```ts
total: number;
```

##### retrieval

```ts
retrieval: object;
```

###### retrieval.avgDuration

```ts
avgDuration: object;
```

###### retrieval.avgDuration.mean

```ts
mean: number;
```

###### retrieval.totalOperations

```ts
totalOperations: number;
```

###### retrieval.totalResults

```ts
totalResults: number;
```

---

### recordBackpressure()

```ts
recordBackpressure(
   action,
   bufferSize?,
   threshold?
): void;
```

Count a backpressure event and keep the buffer size as a sample.

#### Parameters

| Parameter     | Type     | Description                                           |
| ------------- | -------- | ----------------------------------------------------- |
| `action`      | `string` | 'applied' or 'released'; other values are not counted |
| `bufferSize?` | `number` | Buffer size at the time of the event                  |
| `threshold?`  | `number` | Backpressure threshold (unused)                       |

#### Returns

`void`

---

### recordConcurrency()

```ts
recordConcurrency(maxConcurrency, avgConcurrency): void;
```

Record a concurrency sample. Keeps the highest max seen and every average.

#### Parameters

| Parameter        | Type     | Description                       |
| ---------------- | -------- | --------------------------------- |
| `maxConcurrency` | `number` | Peak concurrency in the sample    |
| `avgConcurrency` | `number` | Average concurrency in the sample |

#### Returns

`void`

---

### recordEmbedding()

```ts
recordEmbedding(
   provider,
   duration,
   tokens,
   batches
): void;
```

Record one embedding call.

#### Parameters

| Parameter  | Type     | Description              |
| ---------- | -------- | ------------------------ |
| `provider` | `string` | Provider name (unused)   |
| `duration` | `number` | Duration in milliseconds |
| `tokens`   | `number` | Tokens embedded          |
| `batches`  | `number` | Batches sent             |

#### Returns

`void`

---

### recordError()

```ts
recordError(
   type,
   component?,
   provider?,
   error?
): void;
```

Count an error by type and by component.

#### Parameters

| Parameter    | Type     | Description                                    |
| ------------ | -------- | ---------------------------------------------- |
| `type`       | `string` | Error type, such as 'plugin', 'stage' or 'llm' |
| `component?` | `string` | Plugin or component name                       |
| `provider?`  | `string` | Provider name (unused)                         |
| `error?`     | `Error`  | The error (unused)                             |

#### Returns

`void`

---

### recordLLM()

```ts
recordLLM(
   provider,
   duration,
   inputTokens,
   outputTokens,
   streaming?
): void;
```

Record one LLM call.

#### Parameters

| Parameter      | Type      | Description                          |
| -------------- | --------- | ------------------------------------ |
| `provider`     | `string`  | Provider name (unused)               |
| `duration`     | `number`  | Duration in milliseconds             |
| `inputTokens`  | `number`  | Prompt tokens                        |
| `outputTokens` | `number`  | Completion tokens                    |
| `streaming?`   | `boolean` | Whether the call streamed its output |

#### Returns

`void`

---

### recordMemoryUsage()

```ts
recordMemoryUsage(): void;
```

Store heapUsed and heapTotal from process.memoryUsage() and the used
percentage, rounded.

#### Returns

`void`

---

### recordOperationEnd()

```ts
recordOperationEnd(
   type?,
   component?,
   provider?,
   duration?,
   status?
): void;
```

Mark an active operation as finished. A status of 'error' or 'failed'
counts as failed; any other status counts as successful.

#### Parameters

| Parameter    | Type     | Description                       |
| ------------ | -------- | --------------------------------- |
| `type?`      | `string` | Operation type (unused)           |
| `component?` | `string` | Component name (unused)           |
| `provider?`  | `string` | Provider name (unused)            |
| `duration?`  | `number` | Duration in milliseconds (unused) |
| `status?`    | `string` | Outcome of the operation          |

#### Returns

`void`

---

### recordOperationStart()

```ts
recordOperationStart(
   type?,
   component?,
   provider?
): void;
```

Count an operation as started and active.

#### Parameters

| Parameter    | Type     | Description             |
| ------------ | -------- | ----------------------- |
| `type?`      | `string` | Operation type (unused) |
| `component?` | `string` | Component name (unused) |
| `provider?`  | `string` | Provider name (unused)  |

#### Returns

`void`

---

### recordRetrieval()

```ts
recordRetrieval(
   provider,
   duration,
   results
): void;
```

Record one retrieval call.

#### Parameters

| Parameter  | Type     | Description                |
| ---------- | -------- | -------------------------- |
| `provider` | `string` | Provider name (unused)     |
| `duration` | `number` | Duration in milliseconds   |
| `results`  | `number` | Number of results returned |

#### Returns

`void`
