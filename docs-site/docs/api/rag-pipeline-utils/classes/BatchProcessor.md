---
mdx:
  format: md
---

# Class: BatchProcessor

Batch Processor Class

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new BatchProcessor(options?): BatchProcessor;
```

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `options?` | \{ \} |

#### Returns

`BatchProcessor`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                                | Type              |
| ------------------------------------------------------- | ----------------- |
| <a id="property-abortcontroller"></a> `abortController` | `AbortController` |
| <a id="property-adaptivestate"></a> `adaptiveState`     | `object`          |
| `adaptiveState.optimalBatchSize`                        | `any`             |
| `adaptiveState.recentBatchSizes`                        | `any`[]           |
| `adaptiveState.recentProcessingTimes`                   | `any`[]           |
| <a id="property-cancelled"></a> `cancelled`             | `boolean`         |
| <a id="property-config"></a> `config`                   | `object`          |
| `config.adaptiveSizing`                                 | `boolean`         |
| `config.enableMetrics`                                  | `boolean`         |
| `config.maxItemsPerBatch`                               | `number`          |
| `config.maxMemoryMB`                                    | `number`          |
| `config.maxRetries`                                     | `number`          |
| `config.maxTokensPerBatch`                              | `number`          |
| `config.minItemsPerBatch`                               | `number`          |
| `config.progressInterval`                               | `number`          |
| `config.retryBackoff`                                   | `number`          |
| `config.retryDelay`                                     | `number`          |
| `config.streamingThreshold`                             | `number`          |
| `config.targetBatchUtilization`                         | `number`          |
| <a id="property-metrics"></a> `metrics`                 | `object`          |
| `metrics.apiCallsSaved`                                 | `number`          |
| `metrics.avgBatchSize`                                  | `number`          |
| `metrics.avgTokensPerBatch`                             | `number`          |
| `metrics.failedBatches`                                 | `number`          |
| `metrics.memoryUsed`                                    | `number`          |
| `metrics.peakMemory`                                    | `number`          |
| `metrics.processedItems`                                | `number`          |
| `metrics.successfulBatches`                             | `number`          |
| `metrics.totalBatches`                                  | `number`          |
| `metrics.totalItems`                                    | `number`          |
| `metrics.totalTime`                                     | `number`          |
| `metrics.totalTokens`                                   | `number`          |
| <a id="property-processing"></a> `processing`           | `boolean`         |

## Methods

### cancel()

```ts
cancel(): void;
```

Cancel ongoing processing

#### Returns

`void`

---

### getMetrics()

```ts
getMetrics(): object;
```

Get current metrics

#### Returns

`object`

##### apiCallsSaved

```ts
apiCallsSaved: number;
```

##### avgBatchSize

```ts
avgBatchSize: number;
```

##### avgTokensPerBatch

```ts
avgTokensPerBatch: number;
```

##### cancelled

```ts
cancelled: boolean;
```

##### efficiency

```ts
efficiency: object;
```

###### efficiency.apiCallReduction

```ts
apiCallReduction: number;
```

###### efficiency.batchUtilization

```ts
batchUtilization: number;
```

###### efficiency.throughput

```ts
throughput: number;
```

###### efficiency.tokenUtilization

```ts
tokenUtilization: number;
```

##### failedBatches

```ts
failedBatches: number;
```

##### memoryUsed

```ts
memoryUsed: number;
```

##### peakMemory

```ts
peakMemory: number;
```

##### processedItems

```ts
processedItems: number;
```

##### processing

```ts
processing: boolean;
```

##### successfulBatches

```ts
successfulBatches: number;
```

##### totalBatches

```ts
totalBatches: number;
```

##### totalItems

```ts
totalItems: number;
```

##### totalTime

```ts
totalTime: number;
```

##### totalTokens

```ts
totalTokens: number;
```

---

### getStatus()

```ts
getStatus(): object;
```

Get processing status

#### Returns

`object`

##### cancelled

```ts
cancelled: boolean;
```

##### failedBatches

```ts
failedBatches: number;
```

##### processedItems

```ts
processedItems: number;
```

##### processing

```ts
processing: boolean;
```

##### progress

```ts
progress: number;
```

##### successfulBatches

```ts
successfulBatches: number;
```

##### totalItems

```ts
totalItems: number;
```

---

### processBatches()

```ts
processBatches(
   items,
   processFn,
   options?
): Promise<any[]>;
```

Process items in optimized batches

#### Parameters

| Parameter                      | Type                                                                                                                                                       | Description                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `items`                        | `any`[]                                                                                                                                                    | Items to process; objects are read from `text` or `content` |
| `processFn`                    | (`arg0`, `arg1`) => `Promise`\<`any`[]\>                                                                                                                   | Processes one batch of texts, returning one result per text |
| `options?`                     | \{ `abortController?`: `AbortController`; `onBatchComplete?`: (`arg0`) => `void`; `onProgress?`: (`arg0`) => `void`; `returnOriginalOrder?`: `boolean`; \} | Processing options                                          |
| `options.abortController?`     | `AbortController`                                                                                                                                          | Abort to stop between batches                               |
| `options.onBatchComplete?`     | (`arg0`) => `void`                                                                                                                                         | -                                                           |
| `options.onProgress?`          | (`arg0`) => `void`                                                                                                                                         | -                                                           |
| `options.returnOriginalOrder?` | `boolean`                                                                                                                                                  | -                                                           |

#### Returns

`Promise`\<`any`[]\>

Processed results

---

### resetMetrics()

```ts
resetMetrics(): void;
```

Reset metrics

#### Returns

`void`
