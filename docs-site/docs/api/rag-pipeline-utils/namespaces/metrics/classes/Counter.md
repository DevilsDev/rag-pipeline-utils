---
mdx:
  format: md
---

# Class: Counter

Monotonic counter that only goes up until reset.

## Constructors

### Constructor

```ts
new Counter(
   name,
   description?,
   labels?
): Counter;
```

#### Parameters

| Parameter      | Type                               | Description                          |
| -------------- | ---------------------------------- | ------------------------------------ |
| `name`         | `string`                           | Metric name                          |
| `description?` | `string`                           | Human-readable description           |
| `labels?`      | \{ \[`x`: `string`\]: `string`; \} | Static labels attached to the metric |

#### Returns

`Counter`

## Properties

| Property                                        | Type     |
| ----------------------------------------------- | -------- |
| <a id="property-description"></a> `description` | `string` |
| <a id="property-labels"></a> `labels`           | `object` |
| <a id="property-name"></a> `name`               | `string` |
| <a id="property-value"></a> `value`             | `number` |

## Methods

### inc()

```ts
inc(n?): void;
```

Add to the counter.

#### Parameters

| Parameter | Type     | Description   |
| --------- | -------- | ------------- |
| `n?`      | `number` | Amount to add |

#### Returns

`void`

#### Throws

If n is negative

---

### reset()

```ts
reset(): void;
```

Set the value back to 0.

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
