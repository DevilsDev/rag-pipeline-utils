---
mdx:
  format: md
---

# Class: CostCalculator

Maps token counts to cost estimates by provider and model.

## Example

```ts
const calc = new CostCalculator();
const cost = calc.estimate("gpt-4o", 1500, 500);
console.log(cost.totalCost); // 0.015
```

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new CostCalculator(options?): CostCalculator;
```

#### Parameters

| Parameter                | Type                                                                                                                                                                                                                                                     | Description                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `options?`               | \{ `customPricing?`: `Record`\<`string`, \{ `input`: `number`; `output`: `number`; `unit`: `number`; \}\>; `pricing?`: `Record`\<`string`, \{ `asOf?`: `string`; `input`: `number`; `output`: `number`; `source?`: `string`; `unit?`: `number`; \}\>; \} | -                                                                           |
| `options.customPricing?` | `Record`\<`string`, \{ `input`: `number`; `output`: `number`; `unit`: `number`; \}\>                                                                                                                                                                     | Additional or override model pricing entries, merged over the base table.   |
| `options.pricing?`       | `Record`\<`string`, \{ `asOf?`: `string`; `input`: `number`; `output`: `number`; `source?`: `string`; `unit?`: `number`; \}\>                                                                                                                            | Replaces the built-in pricing table entirely (only these models are known). |

#### Returns

`CostCalculator`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                | Type     |
| --------------------------------------- | -------- |
| <a id="property-pricing"></a> `pricing` | `object` |

## Methods

### addModel()

```ts
addModel(model, pricing): void;
```

Register custom model pricing.

#### Parameters

| Parameter         | Type                                                                                                    | Description         |
| ----------------- | ------------------------------------------------------------------------------------------------------- | ------------------- |
| `model`           | `string`                                                                                                | Model identifier.   |
| `pricing`         | \{ `asOf?`: `string`; `input`: `number`; `output`: `number`; `source?`: `string`; `unit?`: `number`; \} | Pricing definition. |
| `pricing.asOf?`   | `string`                                                                                                | -                   |
| `pricing.input`   | `number`                                                                                                | -                   |
| `pricing.output`  | `number`                                                                                                | -                   |
| `pricing.source?` | `string`                                                                                                | -                   |
| `pricing.unit?`   | `number`                                                                                                | -                   |

#### Returns

`void`

---

### estimate()

```ts
estimate(
   model,
   inputTokens,
   outputTokens?
): object;
```

Estimate the cost for a given token count.

#### Parameters

| Parameter       | Type     | Description                                                   |
| --------------- | -------- | ------------------------------------------------------------- |
| `model`         | `string` | Model identifier (case-insensitive, partial match supported). |
| `inputTokens`   | `number` | Number of input / prompt tokens.                              |
| `outputTokens?` | `number` | Number of output / completion tokens.                         |

#### Returns

`object`

##### currency

```ts
currency: string;
```

##### inputCost

```ts
inputCost: number;
```

##### inputTokens

```ts
inputTokens: number;
```

##### model

```ts
model: string;
```

##### outputCost

```ts
outputCost: number;
```

##### outputTokens

```ts
outputTokens: number;
```

##### pricingAsOf?

```ts
pricingAsOf?: string;
```

##### pricingSource?

```ts
pricingSource?: string;
```

##### totalCost

```ts
totalCost: number;
```

##### warning?

```ts
warning?: string;
```

---

### getModelPricing()

```ts
getModelPricing(model): object;
```

Retrieve pricing for a specific model.

#### Parameters

| Parameter | Type     | Description                                   |
| --------- | -------- | --------------------------------------------- |
| `model`   | `string` | Model identifier (supports fuzzy resolution). |

#### Returns

`object`

##### asOf?

```ts
asOf?: string;
```

##### input

```ts
input: number;
```

##### output

```ts
output: number;
```

##### source?

```ts
source?: string;
```

##### unit

```ts
unit: number;
```

---

### getPricingMetadata()

```ts
static getPricingMetadata(): Readonly<{
  asOf: "2026-04-07";
  currency: "USD";
  note: "Built-in list prices, not re-verified since asOf. Override with the `pricing` or `customPricing` option.";
  sources: Readonly<{
     anthropic: "https://www.anthropic.com/pricing#api";
     cohere: "https://cohere.com/pricing";
     openai: "https://openai.com/api/pricing/";
  }>;
  verified: false;
}>;
```

Provenance of the built-in pricing table.

#### Returns

`Readonly`\<\{
`asOf`: `"2026-04-07"`;
`currency`: `"USD"`;
`note`: ``"Built-in list prices, not re-verified since asOf. Override with the `pricing` or `customPricing` option."``;
`sources`: `Readonly`\<\{
`anthropic`: `"https://www.anthropic.com/pricing#api"`;
`cohere`: `"https://cohere.com/pricing"`;
`openai`: `"https://openai.com/api/pricing/"`;
\}\>;
`verified`: `false`;
\}\>

---

### listModels()

```ts
listModels(): string[];
```

List all known model names.

#### Returns

`string`[]
