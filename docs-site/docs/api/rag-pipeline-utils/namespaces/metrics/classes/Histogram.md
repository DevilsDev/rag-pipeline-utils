---
mdx:
  format: md
---

# Class: Histogram

Histogram with cumulative bucket counts. It also keeps every observed value
in memory to compute percentiles and standard deviation.

## Constructors

### Constructor

```ts
new Histogram(
   name,
   description?,
   labels?,
   buckets?
): Histogram;
```

#### Parameters

| Parameter      | Type                               | Description                                                                    |
| -------------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| `name`         | `string`                           | Metric name                                                                    |
| `description?` | `string`                           | Human-readable description                                                     |
| `labels?`      | \{ \[`x`: `string`\]: `string`; \} | Static labels attached to the metric                                           |
| `buckets?`     | `number`[]                         | Bucket upper bounds, sorted ascending on construction. A +Inf bucket is added. |

#### Returns

`Histogram`

## Properties

| Property                                          | Type       |
| ------------------------------------------------- | ---------- |
| <a id="property-bucketcounts"></a> `bucketCounts` | `any`[]    |
| <a id="property-buckets"></a> `buckets`           | `number`[] |
| <a id="property-count"></a> `count`               | `number`   |
| <a id="property-description"></a> `description`   | `string`   |
| <a id="property-labels"></a> `labels`             | `object`   |
| <a id="property-max"></a> `max`                   | `number`   |
| <a id="property-min"></a> `min`                   | `number`   |
| <a id="property-name"></a> `name`                 | `string`   |
| <a id="property-sum"></a> `sum`                   | `number`   |

## Methods

### export()

```ts
export(): object;
```

Cumulative count per bucket bound (plus '+Inf') together with getStatistics().

#### Returns

`object`

##### buckets

```ts
buckets: object;
```

###### Index Signature

```ts
[x: string]: number
```

##### count

```ts
count: number;
```

##### max

```ts
max: number;
```

##### mean

```ts
mean: number;
```

##### min

```ts
min: number;
```

##### stdDev

```ts
stdDev: number;
```

##### sum

```ts
sum: number;
```

---

### getPercentiles()

```ts
getPercentiles(percentiles?): object;
```

Percentiles of the observed values by the nearest-rank method. Returns 0
for each percentile when nothing has been observed.

#### Parameters

| Parameter      | Type       | Description                   |
| -------------- | ---------- | ----------------------------- |
| `percentiles?` | `number`[] | Percentiles to compute, 0-100 |

#### Returns

`object`

Value for each requested percentile

---

### getStatistics()

```ts
getStatistics(): object;
```

Mean, population standard deviation, min, max, count and sum of the
observed values. With no observations, min and max are null.

#### Returns

`object`

##### count

```ts
count: number;
```

##### max

```ts
max: number;
```

##### mean

```ts
mean: number;
```

##### min

```ts
min: number;
```

##### stdDev

```ts
stdDev: number;
```

##### sum

```ts
sum: number;
```

---

### observe()

```ts
observe(v): void;
```

Record a value. Non-numbers and NaN are ignored.

#### Parameters

| Parameter | Type     | Description    |
| --------- | -------- | -------------- |
| `v`       | `number` | Observed value |

#### Returns

`void`

---

### reset()

```ts
reset(): void;
```

Clear all bucket counts, statistics and stored observations.

#### Returns

`void`

---

### toJSON()

```ts
toJSON(): object;
```

Snapshot of the histogram with the current time as timestamp. Does not
include min, max or percentiles.

#### Returns

`object`

##### bucketCounts

```ts
bucketCounts: number[];
```

##### buckets

```ts
buckets: number[];
```

##### count

```ts
count: number;
```

##### description

```ts
description: string;
```

##### labels

```ts
labels: object;
```

###### Index Signature

```ts
[x: string]: string
```

##### name

```ts
name: string;
```

##### sum

```ts
sum: number;
```

##### timestamp

```ts
timestamp: string;
```

##### type

```ts
type: string;
```
