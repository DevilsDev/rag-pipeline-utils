---
mdx:
  format: md
---

# Class: MetricsRegistry

## Constructors

### Constructor

```ts
new MetricsRegistry(): MetricsRegistry;
```

#### Returns

`MetricsRegistry`

## Methods

### clear()

```ts
clear(): void;
```

Remove every registered metric.

#### Returns

`void`

---

### exportMetrics()

```ts
exportMetrics(): string;
```

Serialize all metrics (their toJSON output) with a timestamp.

#### Returns

`string`

JSON string with timestamp and metrics fields

---

### getAllMetrics()

```ts
getAllMetrics(): (Counter | Histogram | Gauge)[];
```

All registered metrics in registration order.

#### Returns

([`Counter`](Counter.md) \| [`Histogram`](Histogram.md) \| [`Gauge`](Gauge.md))[]

---

### getMetric()

```ts
getMetric(name): Counter | Histogram | Gauge;
```

Look up a metric by name.

#### Parameters

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `name`    | `string` | Metric name |

#### Returns

[`Counter`](Counter.md) \| [`Histogram`](Histogram.md) \| [`Gauge`](Gauge.md)

The metric, or undefined if not registered

---

### getOrCreateCounter()

```ts
getOrCreateCounter(
   name,
   description?,
   labels?
): Counter;
```

Return the metric registered under name, or create and register a Counter.
Throws a TypeError when the name belongs to a metric of another type.

#### Parameters

| Parameter      | Type                               | Description                   |
| -------------- | ---------------------------------- | ----------------------------- |
| `name`         | `string`                           | Metric name                   |
| `description?` | `string`                           | Description for a new counter |
| `labels?`      | \{ \[`x`: `string`\]: `string`; \} | Labels for a new counter      |

#### Returns

[`Counter`](Counter.md)

---

### getOrCreateGauge()

```ts
getOrCreateGauge(
   name,
   description?,
   labels?
): Gauge;
```

Return the metric registered under name, or create and register a Gauge.
Throws a TypeError when the name belongs to a metric of another type.

#### Parameters

| Parameter      | Type                               | Description                 |
| -------------- | ---------------------------------- | --------------------------- |
| `name`         | `string`                           | Metric name                 |
| `description?` | `string`                           | Description for a new gauge |
| `labels?`      | \{ \[`x`: `string`\]: `string`; \} | Labels for a new gauge      |

#### Returns

[`Gauge`](Gauge.md)

---

### getOrCreateHistogram()

```ts
getOrCreateHistogram(
   name,
   description?,
   labels?,
   buckets?
): Histogram;
```

Return the metric registered under name, or create and register a
Histogram. Throws a TypeError when the name belongs to a metric of
another type.

#### Parameters

| Parameter      | Type                               | Description                       |
| -------------- | ---------------------------------- | --------------------------------- |
| `name`         | `string`                           | Metric name                       |
| `description?` | `string`                           | Description for a new histogram   |
| `labels?`      | \{ \[`x`: `string`\]: `string`; \} | Labels for a new histogram        |
| `buckets?`     | `number`[]                         | Bucket bounds for a new histogram |

#### Returns

[`Histogram`](Histogram.md)

---

### register()

```ts
register(metric): void;
```

Add a metric under its name.

#### Parameters

| Parameter | Type                                                                          | Description        |
| --------- | ----------------------------------------------------------------------------- | ------------------ |
| `metric`  | [`Counter`](Counter.md) \| [`Histogram`](Histogram.md) \| [`Gauge`](Gauge.md) | Metric to register |

#### Returns

`void`

#### Throws

If a metric with the same name is already registered
