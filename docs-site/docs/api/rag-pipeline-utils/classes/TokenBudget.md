---
mdx:
  format: md
---

# Class: TokenBudget

Configurable token and cost budgets with hard and soft limits.

Emits:

- `usage` — after every [record](#record) call with the recorded entry.
- `warning` — when usage crosses the soft limit threshold.
- `exceeded` — when usage crosses a hard limit.

## Example

```ts
const budget = new TokenBudget({ maxTokens: 100000, maxCost: 5.0 });
budget.on("warning", (msg) => console.warn(msg));
const status = budget.check(2000, 0.1);
if (status.allowed) budget.record(2000, 0.1);
```

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new TokenBudget(options?): TokenBudget;
```

#### Parameters

| Parameter                   | Type                                                                                                            | Description                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `options?`                  | \{ `maxCost?`: `number`; `maxTokens?`: `number`; `softLimitPercent?`: `number`; `trackingWindow?`: `number`; \} | -                                                 |
| `options.maxCost?`          | `number`                                                                                                        | Hard cost limit (USD).                            |
| `options.maxTokens?`        | `number`                                                                                                        | Hard token limit.                                 |
| `options.softLimitPercent?` | `number`                                                                                                        | Fraction (0-1) at which soft-limit warnings fire. |
| `options.trackingWindow?`   | `number`                                                                                                        | Sliding window in ms (0 disables).                |

#### Returns

`TokenBudget`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                              | Type     |
| ------------------------------------- | -------- |
| <a id="property-config"></a> `config` | `object` |
| `config.maxCost`                      | `number` |
| `config.maxTokens`                    | `number` |
| `config.softLimitPercent`             | `number` |
| `config.trackingWindow`               | `number` |
| <a id="property-usage"></a> `usage`   | `object` |
| `usage.cost`                          | `number` |
| `usage.history`                       | `any`[]  |
| `usage.operations`                    | `number` |
| `usage.tokens`                        | `number` |

## Methods

### check()

```ts
check(tokens?, cost?): object;
```

Check whether a prospective usage fits within the budget.

#### Parameters

| Parameter | Type     | Description                  |
| --------- | -------- | ---------------------------- |
| `tokens?` | `number` | Tokens about to be consumed. |
| `cost?`   | `number` | Cost about to be incurred.   |

#### Returns

`object`

##### allowed

```ts
allowed: boolean;
```

##### reason?

```ts
reason?: string;
```

##### remaining

```ts
remaining: object;
```

###### remaining.cost

```ts
cost: number;
```

###### remaining.tokens

```ts
tokens: number;
```

##### usage

```ts
usage: object;
```

###### usage.cost

```ts
cost: number;
```

###### usage.operations

```ts
operations: number;
```

###### usage.tokens

```ts
tokens: number;
```

##### warnings

```ts
warnings: string[];
```

---

### getUsage()

```ts
getUsage(): object;
```

Return current usage summary.

#### Returns

`object`

##### cost

```ts
cost: number;
```

##### limits

```ts
limits: object;
```

###### limits.maxCost

```ts
maxCost: number;
```

###### limits.maxTokens

```ts
maxTokens: number;
```

##### operations

```ts
operations: number;
```

##### remaining

```ts
remaining: object;
```

###### remaining.cost

```ts
cost: number;
```

###### remaining.tokens

```ts
tokens: number;
```

##### tokens

```ts
tokens: number;
```

---

### record()

```ts
record(tokens, cost?): void;
```

Record actual token and cost usage.

#### Parameters

| Parameter | Type     | Description          |
| --------- | -------- | -------------------- |
| `tokens`  | `number` | Tokens consumed.     |
| `cost?`   | `number` | Cost incurred (USD). |

#### Returns

`void`

---

### reset()

```ts
reset(): void;
```

Reset all usage counters to zero.

#### Returns

`void`
