---
mdx:
  format: md
---

# Class: Gauge

Gauge holding a value that can be set, raised or lowered.

## Constructors

### Constructor

```ts
new Gauge(
   name,
   description?,
   labels?
): Gauge;
```

#### Parameters

| Parameter      | Type                               | Description                          |
| -------------- | ---------------------------------- | ------------------------------------ |
| `name`         | `string`                           | Metric name                          |
| `description?` | `string`                           | Human-readable description           |
| `labels?`      | \{ \[`x`: `string`\]: `string`; \} | Static labels attached to the metric |

#### Returns

`Gauge`

## Properties

| Property                                        | Type     |
| ----------------------------------------------- | -------- |
| <a id="property-description"></a> `description` | `string` |
| <a id="property-labels"></a> `labels`           | `object` |
| <a id="property-name"></a> `name`               | `string` |
| <a id="property-value"></a> `value`             | `number` |

## Methods

### dec()

```ts
dec(n?): void;
```

Subtract from the value.

#### Parameters

| Parameter | Type     | Description        |
| --------- | -------- | ------------------ |
| `n?`      | `number` | Amount to subtract |

#### Returns

`void`

---

### inc()

```ts
inc(n?): void;
```

Add to the value.

#### Parameters

| Parameter | Type     | Description   |
| --------- | -------- | ------------- |
| `n?`      | `number` | Amount to add |

#### Returns

`void`

---

### reset()

```ts
reset(): void;
```

Set the value back to 0.

#### Returns

`void`

---

### set()

```ts
set(v): void;
```

Set the value.

#### Parameters

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `v`       | `number` | New value   |

#### Returns

`void`

---

### toJSON()

```ts
toJSON(): object;
```

Snapshot of the metric with the current time as timestamp.

#### Returns

`object`

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

##### timestamp

```ts
timestamp: string;
```

##### type

```ts
type: string;
```

##### value

```ts
value: number;
```
