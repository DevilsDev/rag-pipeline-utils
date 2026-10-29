---
mdx:
  format: md
---

# Class: MetricsAggregator

Collects and aggregates pipeline metrics into dashboard-ready snapshots.

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new MetricsAggregator(options?): MetricsAggregator;
```

#### Parameters

| Parameter  | Type                                   | Description |
| ---------- | -------------------------------------- | ----------- |
| `options?` | `Partial`\<`MetricsAggregatorConfig`\> | -           |

#### Returns

`MetricsAggregator`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                    | Type       | Description                                    |
| ------------------------------------------- | ---------- | ---------------------------------------------- |
| <a id="property-config"></a> `config`       | `object`   | -                                              |
| `config.maxHistory`                         | `number`   | - Maximum data points to keep (default: 3600)  |
| `config.sampleInterval`                     | `number`   | - Milliseconds between samples (default: 1000) |
| `config.windowSize`                         | `number`   | - Rolling window in seconds (default: 60)      |
| <a id="property-costs"></a> `costs`         | `object`[] | -                                              |
| <a id="property-counters"></a> `counters`   | `object`   | -                                              |
| `counters.embeddings`                       | `number`   | -                                              |
| `counters.errors`                           | `number`   | -                                              |
| `counters.generations`                      | `number`   | -                                              |
| `counters.queries`                          | `number`   | -                                              |
| `counters.retrievals`                       | `number`   | -                                              |
| <a id="property-errors"></a> `errors`       | `object`[] | -                                              |
| <a id="property-history"></a> `history`     | `object`[] | -                                              |
| <a id="property-latencies"></a> `latencies` | `object`[] | -                                              |
| <a id="property-memory"></a> `memory`       | `object`[] | -                                              |
| <a id="property-starttime"></a> `startTime` | `number`   | -                                              |

## Methods

### getSnapshot()

```ts
getSnapshot(): any;
```

Return a complete dashboard snapshot of current metrics.

#### Returns

`any`

Dashboard-ready metrics snapshot

---

### getTimeSeries()

```ts
getTimeSeries(metric, windowSeconds?): object[];
```

Return time-bucketed data for charting a given metric.

#### Parameters

| Parameter        | Type                                                                  | Description                                            |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------------------------ |
| `metric`         | `"latency"` \| `"throughput"` \| `"cost"` \| `"memory"` \| `"errors"` | -                                                      |
| `windowSeconds?` | `number`                                                              | Time window in seconds (defaults to config.windowSize) |

#### Returns

`object`[]

---

### recordEmbedding()

```ts
recordEmbedding(data): void;
```

Record an embedding operation metric.

#### Parameters

| Parameter | Type        | Description |
| --------- | ----------- | ----------- |
| `data`    | `QueryData` | -           |

#### Returns

`void`

---

### recordError()

```ts
recordError(data): void;
```

Record an error event.

#### Parameters

| Parameter | Type        | Description |
| --------- | ----------- | ----------- |
| `data`    | `ErrorData` | -           |

#### Returns

`void`

---

### recordGeneration()

```ts
recordGeneration(data): void;
```

Record a generation operation metric.

#### Parameters

| Parameter | Type        | Description |
| --------- | ----------- | ----------- |
| `data`    | `QueryData` | -           |

#### Returns

`void`

---

### recordMemory()

```ts
recordMemory(data?): void;
```

Record a memory sample.

#### Parameters

| Parameter         | Type                                                                   | Description |
| ----------------- | ---------------------------------------------------------------------- | ----------- |
| `data?`           | \{ `heapTotal?`: `number`; `heapUsed?`: `number`; `rss?`: `number`; \} | -           |
| `data.heapTotal?` | `number`                                                               | -           |
| `data.heapUsed?`  | `number`                                                               | -           |
| `data.rss?`       | `number`                                                               | -           |

#### Returns

`void`

---

### recordQuery()

```ts
recordQuery(data): void;
```

Record a query operation metric.

#### Parameters

| Parameter | Type        | Description |
| --------- | ----------- | ----------- |
| `data`    | `QueryData` | -           |

#### Returns

`void`

---

### recordRetrieval()

```ts
recordRetrieval(data): void;
```

Record a retrieval operation metric.

#### Parameters

| Parameter | Type        | Description |
| --------- | ----------- | ----------- |
| `data`    | `QueryData` | -           |

#### Returns

`void`

---

### reset()

```ts
reset(): void;
```

Reset all counters, history, and collected metrics.

#### Returns

`void`
