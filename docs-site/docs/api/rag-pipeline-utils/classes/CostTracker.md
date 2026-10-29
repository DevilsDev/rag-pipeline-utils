---
mdx:
  format: md
---

# Class: CostTracker

Wraps pipeline execution to automatically track token usage and costs.

## Example

```ts
const tracker = new CostTracker({
  model: "gpt-4o",
  enableBudget: true,
  budgetOptions: { maxCost: 10 },
});
const wrapped = tracker.wrap(pipeline);
const result = await wrapped.run(input);
console.log(result.cost); // { inputTokens, outputTokens, estimatedCost, model }
console.log(tracker.getSummary());
```

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new CostTracker(options?): CostTracker;
```

#### Parameters

| Parameter                    | Type                                                                                                                                           | Description                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `options?`                   | \{ `budgetOptions?`: `object`; `calculatorOptions?`: `object`; `embeddingModel?`: `string`; `enableBudget?`: `boolean`; `model?`: `string`; \} | -                                                         |
| `options.budgetOptions?`     | `object`                                                                                                                                       | Options forwarded to [TokenBudget](TokenBudget.md).       |
| `options.calculatorOptions?` | `object`                                                                                                                                       | Options forwarded to [CostCalculator](CostCalculator.md). |
| `options.embeddingModel?`    | `string`                                                                                                                                       | Default embedding model.                                  |
| `options.enableBudget?`      | `boolean`                                                                                                                                      | Whether to enforce a token/cost budget.                   |
| `options.model?`             | `string`                                                                                                                                       | Default LLM model for cost estimation.                    |

#### Returns

`CostTracker`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                              | Type                                  |
| ----------------------------------------------------- | ------------------------------------- |
| <a id="property-budget"></a> `budget`                 | [`TokenBudget`](TokenBudget.md)       |
| <a id="property-calculator"></a> `calculator`         | [`CostCalculator`](CostCalculator.md) |
| <a id="property-config"></a> `config`                 | `object`                              |
| `config.budgetOptions`                                | `object`                              |
| `config.calculatorOptions?`                           | `object`                              |
| `config.embeddingModel`                               | `string`                              |
| `config.enableBudget`                                 | `boolean`                             |
| `config.model`                                        | `string`                              |
| <a id="property-currentsession"></a> `currentSession` | `object`                              |
| `currentSession.endTime`                              | `any`                                 |
| `currentSession.entries`                              | `any`[]                               |
| `currentSession.id`                                   | `string`                              |
| `currentSession.metadata`                             | `any`                                 |
| `currentSession.startTime`                            | `number`                              |
| `currentSession.totalCost`                            | `number`                              |
| `currentSession.totalTokens`                          | `number`                              |
| <a id="property-sessions"></a> `sessions`             | `any`[]                               |

## Methods

### endSession()

```ts
endSession(): object;
```

End the current tracking session and compute totals.

#### Returns

`object`

The closed session, or null if no session was active.

---

### getHistory()

```ts
getHistory(): object[];
```

Return the full history of tracked operations across all sessions.

#### Returns

`object`[]

---

### getSummary()

```ts
getSummary(): object;
```

Return an aggregate summary across all sessions.

#### Returns

`object`

##### avgCostPerQuery

```ts
avgCostPerQuery: number;
```

##### breakdown

```ts
breakdown: Record<
  string,
  {
    cost: number;
    count: number;
    tokens: number;
  }
>;
```

##### sessionCount

```ts
sessionCount: number;
```

##### totalCost

```ts
totalCost: number;
```

##### totalTokens

```ts
totalTokens: number;
```

---

### startSession()

```ts
startSession(metadata?): object;
```

Start a new tracking session.

#### Parameters

| Parameter   | Type     | Description                                  |
| ----------- | -------- | -------------------------------------------- |
| `metadata?` | `object` | Arbitrary metadata to attach to the session. |

#### Returns

`object`

##### entries

```ts
entries: any[];
```

##### id

```ts
id: string;
```

##### metadata

```ts
metadata: object;
```

##### startTime

```ts
startTime: number;
```

##### totalCost

```ts
totalCost: number;
```

##### totalTokens

```ts
totalTokens: number;
```

---

### wrap()

```ts
wrap(pipeline): object;
```

Wrap a pipeline so that every `.run()` call is cost-tracked.

#### Parameters

| Parameter  | Type     | Description                    |
| ---------- | -------- | ------------------------------ |
| `pipeline` | `object` | Object with a `.run()` method. |

#### Returns

`object`

A proxy pipeline whose `.run()` enriches results with cost data.
